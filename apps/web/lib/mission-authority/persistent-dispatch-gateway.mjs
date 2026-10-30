/**
 * Server-side dispatch orchestration for the persistent W69 JIT gate.
 *
 * The caller MUST inject a privileged server-only Supabase client and a trusted adapter.
 * This module performs no network/provider work except the adapter.dispatch call.
 * No route currently wires a real provider to this module; tests use fake adapters.
 */

export const PERSISTENT_DISPATCH_DECISIONS = Object.freeze({
  DENY: "DENY",
  DISPATCHED: "DISPATCHED",
  RECONCILE_REQUIRED: "RECONCILE_REQUIRED",
  RECONCILED: "RECONCILED",
});

const KNOWN_DENIAL_CODES = new Set([
  "TRUSTED_EXECUTOR_REQUIRED",
  "EXECUTION_NOT_FOUND",
  "MISSION_CLOSED_OR_NOT_FOUND",
  "EXECUTION_NOT_RUNNING",
  "EXECUTION_CANCELLATION_REQUESTED",
  "EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH",
  "EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION",
  "AGENT_AUTHORITY_CHANGED",
  "AGENT_NOT_FOUND_OR_FORBIDDEN",
  "JIT_EXTERNAL_SIDE_EFFECT_SCOPE_REQUIRED",
  "ACTION_NOT_EXECUTABLE",
  "EXECUTION_BUDGET_RESERVATION_NOT_OPEN",
  "AUTHORITY_BUDGET_MISSING_OR_INACTIVE",
  "AUTHORITY_BUDGET_BINDING_MISMATCH",
  "AUTHORITY_BUDGET_NOT_IN_VALIDITY_WINDOW",
  "APPROVAL_REQUIRED_OR_SCOPE_CHANGED",
  "APPROVAL_EXPIRED_REQUIRES_REAPPROVAL",
]);

const RECEIPT_KEYS = new Set([
  "provider",
  "id",
  "reference",
  "request_id",
  "message_id",
  "transaction_id",
  "operation_id",
  "status",
  "created_at",
  "timestamp",
  "charge_amount",
  "currency",
]);

const RECEIPT_REFERENCE_KEYS = new Set(["id", "reference", "request_id", "message_id", "transaction_id", "operation_id"]);

const RECEIPT_STRING_LIMIT = 500;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rowFrom(data) {
  if (Array.isArray(data)) return data.length === 1 && record(data[0]) ? data[0] : null;
  return record(data) ? data : null;
}

function errorText(error) {
  return typeof error?.message === "string" ? error.message : "";
}

function knownDenialCode(error) {
  const message = errorText(error);
  for (const code of KNOWN_DENIAL_CODES) {
    if (message === code || message.startsWith(`${code}:`) || message.includes(`${code} `)) {
      return code;
    }
  }
  return "";
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasProviderReceiptReference(receipt) {
  if (!record(receipt)) return false;
  return [...RECEIPT_REFERENCE_KEYS].some((key) => {
    const value = receipt[key];
    return nonEmpty(value) || (typeof value === "number" && Number.isFinite(value));
  });
}

function sha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/**
 * Keep only provider reference fields that are useful for reconciliation.
 * Never persist arbitrary provider payloads or credentials in the execution log.
 */
export function sanitiseProviderReceipt(receipt) {
  if (!record(receipt)) return null;
  const safe = {};
  for (const [key, value] of Object.entries(receipt)) {
    if (!RECEIPT_KEYS.has(key)) continue;
    if (key === "charge_amount") {
      // The database settles reserved spend only from a non-negative JSON number.
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        safe[key] = value;
      }
      continue;
    }
    if (key === "currency") {
      // Match the budget ledger's ISO-style three-letter currency constraint.
      if (typeof value === "string" && /^[A-Z]{3}$/.test(value)) safe[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed.length <= RECEIPT_STRING_LIMIT) safe[key] = trimmed;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    } else if (typeof value === "boolean") {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

function validClaim(claim, executionId) {
  if (!claim || claim.id !== executionId || claim.status !== "RUNNING") return false;
  if (!nonEmpty(claim.dispatch_claimed_at) || !nonEmpty(claim.lease_expires_at)) return false;
  if (!sha256Hex(claim.dispatch_claim_authority_hash)
      || !sha256Hex(claim.dispatch_claim_request_hash)) return false;
  const revision = Number(claim.dispatch_claim_budget_revision);
  if (!Number.isSafeInteger(revision) || revision < 1) return false;
  if (!nonEmpty(claim.idempotency_key) || !record(claim.request) || !record(claim.authority_snapshot)) return false;
  if (claim.authority_snapshot.external_side_effects !== true
      || claim.authority_snapshot.requires_approval !== true
      || !nonEmpty(claim.action_id)
      || !nonEmpty(claim.approval_id)) return false;
  if (!nonEmpty(claim.request.destination) || !nonEmpty(claim.request.audience)) return false;
  const claimedAt = Date.parse(claim.dispatch_claimed_at);
  const expiresAt = Date.parse(claim.lease_expires_at);
  return Number.isFinite(claimedAt)
    && Number.isFinite(expiresAt)
    && claimedAt < expiresAt
    && expiresAt > Date.now();
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function claimEnvelope(claim) {
  // The adapter must not mutate nested approved input after the JIT decision.
  return deepFreeze({
    executionId: claim.id,
    actionId: claim.action_id,
    agentId: claim.agent_id,
    approvalId: claim.approval_id,
    idempotencyKey: claim.idempotency_key,
    destination: claim.request.destination,
    audience: claim.request.audience,
    request: structuredClone(claim.request),
    dispatchClaimedAt: claim.dispatch_claimed_at,
    authorityHash: claim.dispatch_claim_authority_hash,
    requestHash: claim.dispatch_claim_request_hash,
    budgetRevision: Number(claim.dispatch_claim_budget_revision),
  });
}

async function complete(client, executionId, status, result, evidence, errorCode, errorMessage) {
  try {
    const response = await client.rpc("complete_agent_execution", {
      p_execution_id: executionId,
      p_status: status,
      p_result: result,
      p_evidence: evidence,
      p_error_code: errorCode ?? null,
      p_error_message: errorMessage ?? null,
    });
    if (response?.error) return { ok: false, row: null };
    const row = rowFrom(response?.data);
    if (!row || row.id !== executionId) return { ok: false, row: null };
    return { ok: true, row };
  } catch {
    return { ok: false, row: null };
  }
}

function finaliseResult(status, receipt, reasonCode, claim, extraEvidence = {}) {
  const evidence = {
    dispatch_claimed_at: claim.dispatchClaimedAt,
    dispatch_claim_authority_hash: claim.authorityHash,
    dispatch_claim_request_hash: claim.requestHash,
    dispatch_claim_budget_revision: claim.budgetRevision,
    provider_state: status,
    verified: false,
    ...extraEvidence,
  };
  if (receipt) evidence.provider_receipt = receipt;
  return evidence;
}

async function blockBeforeDispatch(client, executionId, reasonCode, claim = null) {
  const evidence = {
    provider_not_sent: true,
    safe_to_retry: true,
    verified: false,
    reconciliation_required: false,
    gateway_reason: reasonCode,
    ...(claim ? {
      dispatch_claimed_at: claim.dispatchClaimedAt,
      dispatch_claim_authority_hash: claim.authorityHash,
      dispatch_claim_request_hash: claim.requestHash,
      dispatch_claim_budget_revision: claim.budgetRevision,
    } : {}),
  };
  const settlement = await complete(
    client,
    executionId,
    "BLOCKED",
    { gateway: "persistent_w69", outcome: "NOT_SENT" },
    evidence,
    reasonCode,
    "The trusted gateway blocked dispatch before calling the provider adapter.",
  );
  return {
    decision: settlement.ok && settlement.row.status === "BLOCKED"
      ? PERSISTENT_DISPATCH_DECISIONS.DENY
      : PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
    executionId,
    reasonCode: settlement.ok ? reasonCode : "PRE_DISPATCH_BLOCK_SETTLEMENT_UNCONFIRMED",
    blockReasonCode: reasonCode,
    dispatched: false,
    persisted: settlement.ok,
    status: settlement.row?.status ?? null,
  };
}

async function recordUnknown(client, executionId, claim, reasonCode, receipt = null) {
  const evidence = finaliseResult("UNKNOWN", receipt, reasonCode, claim, {
    outcome: "UNKNOWN",
    safe_to_retry: false,
    reconciliation_required: true,
  });
  const settlement = await complete(
    client,
    executionId,
    "UNKNOWN",
    { gateway: "persistent_w69", outcome: "UNKNOWN" },
    evidence,
    reasonCode,
    "The provider outcome is unknown. Reconcile the existing attempt; do not dispatch again.",
  );
  const status = settlement.row?.status ?? null;
  return {
    decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
    executionId,
    reasonCode: settlement.ok && status === "UNKNOWN" ? reasonCode : "UNKNOWN_OUTCOME_REQUIRES_RECONCILIATION",
    dispatched: true,
    persisted: settlement.ok,
    status,
  };
}

const RECONCILIATION_METHODS = new Set([
  "provider_lookup",
  "idempotency_key_lookup",
  "receipt_lookup",
  "provider_webhook",
]);

function validReconciliationClaim(claim, executionId) {
  if (!record(claim) || claim.id !== executionId) return false;
  if (["SUCCEEDED", "FAILED"].includes(claim.status)
      && nonEmpty(claim.reconciled_at)
      && record(claim.evidence)
      && record(claim.evidence.reconciliation)) return true;
  if (claim.status !== "UNKNOWN"
      || claim.authority_snapshot?.external_side_effects !== true
      || !nonEmpty(claim.action_id)
      || !nonEmpty(claim.idempotency_key)
      || !record(claim.request)
      || !nonEmpty(claim.request.destination)
      || !nonEmpty(claim.request.audience)
      || !nonEmpty(claim.reconciliation_claim_token)
      || !nonEmpty(claim.reconciliation_claimed_at)
      || !nonEmpty(claim.reconciliation_lease_expires_at)) return false;

  // If this row records the modern JIT dispatch claim, preserve its complete
  // authority tuple through reconciliation: approved scope, approval id,
  // authority/request digests and the budget revision must all remain valid.
  // Legacy records without dispatch_claimed_at keep the created_at fallback,
  // but any present dispatch claim must be complete rather than partial.
  const dispatchClaimFields = [
    claim.dispatch_claimed_at,
    claim.dispatch_claim_authority_hash,
    claim.dispatch_claim_request_hash,
    claim.dispatch_claim_budget_revision,
  ];
  // A partial modern tuple must not fall through to the legacy created_at
  // path just because dispatch_claimed_at itself is absent.
  const hasDispatchClaim = dispatchClaimFields.some((value) => value !== null && value !== undefined);
  if (hasDispatchClaim) {
    const budgetRevision = Number(claim.dispatch_claim_budget_revision);
    if (!nonEmpty(claim.dispatch_claimed_at)
        || claim.authority_snapshot?.requires_approval !== true
        || !nonEmpty(claim.approval_id)
        || !sha256Hex(claim.dispatch_claim_authority_hash)
        || !sha256Hex(claim.dispatch_claim_request_hash)
        || !Number.isSafeInteger(budgetRevision)
        || budgetRevision < 1) return false;
  }

  const dispatchBound = Date.parse(claim.dispatch_claimed_at ?? claim.created_at ?? "");
  const claimedAt = Date.parse(claim.reconciliation_claimed_at);
  const expiresAt = Date.parse(claim.reconciliation_lease_expires_at);
  // Reject malformed/unbound claims before any provider lookup. A valid
  // reconciliation attempt must refer to a recorded dispatch attempt and
  // cannot be claimed earlier than that attempt's persisted time.
  return Number.isFinite(dispatchBound)
    && Number.isFinite(claimedAt)
    && Number.isFinite(expiresAt)
    && dispatchBound <= claimedAt
    && claimedAt < expiresAt
    && expiresAt > Date.now();
}

function reconciliationEnvelope(claim) {
  // Reconciliation lookups must use the exact persisted destination and request.
  return deepFreeze({
    executionId: claim.id,
    actionId: claim.action_id,
    agentId: claim.agent_id,
    approvalId: claim.approval_id ?? null,
    idempotencyKey: claim.idempotency_key,
    destination: claim.request.destination,
    audience: claim.request.audience,
    request: structuredClone(claim.request),
    dispatchClaimedAt: claim.dispatch_claimed_at ?? null,
    dispatchAuthorityHash: claim.dispatch_claim_authority_hash ?? null,
    dispatchRequestHash: claim.dispatch_claim_request_hash ?? null,
    dispatchBudgetRevision: claim.dispatch_claim_budget_revision ?? null,
    reconciliationClaimToken: claim.reconciliation_claim_token,
    reconciliationClaimedAt: claim.reconciliation_claimed_at,
    reconciliationLeaseExpiresAt: claim.reconciliation_lease_expires_at,
    createdAt: claim.created_at ?? null,
  });
}

function validAuthoritativeLookup(result, expectedResult, claim) {
  if (!record(result) || result.authoritative !== true) return false;
  if (!RECONCILIATION_METHODS.has(result.method)) return false;
  if (!nonEmpty(result.providerState) || result.providerState.length > 100) return false;
  if (result.state !== expectedResult) return false;
  if (!nonEmpty(result.checkedAt)) return false;
  const checkedAt = Date.parse(result.checkedAt);
  const dispatchBound = Date.parse(claim.dispatchClaimedAt ?? claim.createdAt ?? "");
  const reconciliationClaimedAt = Date.parse(claim.reconciliationClaimedAt ?? "");
  // Evidence must be produced by the current reconciliation attempt, not a
  // cached lookup from an earlier worker or an earlier failed attempt.
  return Number.isFinite(checkedAt)
    && Number.isFinite(dispatchBound)
    && Number.isFinite(reconciliationClaimedAt)
    && checkedAt > dispatchBound
    && checkedAt > reconciliationClaimedAt
    && checkedAt <= Date.now() + 5 * 60 * 1000;
}

/**
 * Reconcile an existing UNKNOWN attempt without dispatching a new provider
 * request. The adapter must perform a provider lookup only; this function never
 * calls adapter.dispatch and never releases a budget without explicit no-send
 * evidence from that trusted adapter.
 */
export async function reconcileThroughTrustedClaim({ client, adapter, executionId }) {
  if (!nonEmpty(executionId) || !client || typeof client.rpc !== "function"
      || !adapter || typeof adapter.reconcile !== "function" || !nonEmpty(adapter.audience)) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.DENY,
      executionId: nonEmpty(executionId) ? executionId : null,
      reasonCode: "INVALID_RECONCILIATION_GATEWAY_CONFIGURATION",
      providerLookupPerformed: false,
      persisted: false,
      status: null,
    };
  }

  let claimResponse;
  try {
    claimResponse = await client.rpc("claim_agent_execution_reconciliation", {
      p_execution_id: executionId,
    });
  } catch {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "RECONCILIATION_CLAIM_OUTCOME_UNKNOWN",
      providerLookupPerformed: false,
      persisted: false,
      status: null,
    };
  }

  if (claimResponse?.error) {
    const message = errorText(claimResponse.error);
    if (message.includes("EXECUTION_RECONCILIATION_ALREADY_CLAIMED")) {
      return {
        decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
        executionId,
        reasonCode: "RECONCILIATION_ALREADY_CLAIMED",
        providerLookupPerformed: false,
        persisted: false,
        status: "UNKNOWN",
      };
    }
    const denial = knownDenialCode(claimResponse.error);
    return {
      decision: denial ? PERSISTENT_DISPATCH_DECISIONS.DENY : PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: denial || "RECONCILIATION_CLAIM_OUTCOME_UNKNOWN",
      providerLookupPerformed: false,
      persisted: false,
      status: null,
    };
  }

  const claimRow = rowFrom(claimResponse?.data);
  if (!validReconciliationClaim(claimRow, executionId)) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "INVALID_RECONCILIATION_CLAIM_RECORD",
      providerLookupPerformed: false,
      persisted: false,
      status: "UNKNOWN",
    };
  }

  if (["SUCCEEDED", "FAILED"].includes(claimRow.status)
      && nonEmpty(claimRow.reconciled_at)
      && record(claimRow.evidence?.reconciliation)) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILED,
      executionId,
      reasonCode: "ALREADY_RECONCILED",
      providerLookupPerformed: false,
      persisted: true,
      status: claimRow.status,
    };
  }

  if (adapter.audience !== claimRow.request.audience) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "PROVIDER_AUDIENCE_MISMATCH",
      providerLookupPerformed: false,
      persisted: false,
      status: "UNKNOWN",
    };
  }

  const claim = reconciliationEnvelope(claimRow);
  let lookup;
  try {
    lookup = await adapter.reconcile(claim);
  } catch {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "PROVIDER_RECONCILIATION_UNAVAILABLE",
      providerLookupPerformed: true,
      persisted: false,
      status: "UNKNOWN",
    };
  }

  if (!record(lookup) || !["SUCCEEDED", "NOT_SENT"].includes(lookup.state)) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "PROVIDER_OUTCOME_STILL_UNKNOWN",
      providerLookupPerformed: true,
      persisted: false,
      status: "UNKNOWN",
    };
  }
  if (!validAuthoritativeLookup(lookup, lookup.state, claim)) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "AUTHORITATIVE_LOOKUP_EVIDENCE_REQUIRED",
      providerLookupPerformed: true,
      persisted: false,
      status: "UNKNOWN",
    };
  }

  const finalStatus = lookup.state === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
  // Legacy records without a W69 dispatch claim can only be closed as
  // FAILED after authoritative no-send proof. A provider success may be real,
  // but without the original JIT claim the server cannot bind it to this
  // authorized Mission Action, so leave the execution UNKNOWN and held.
  if (finalStatus === "SUCCEEDED" && !nonEmpty(claim.dispatchClaimedAt)) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "LEGACY_SUCCESS_WITHOUT_DISPATCH_CLAIM",
      providerLookupPerformed: true,
      persisted: false,
      status: "UNKNOWN",
    };
  }
  const receipt = lookup.state === "SUCCEEDED" ? sanitiseProviderReceipt(lookup.receipt) : null;
  if (lookup.state === "SUCCEEDED" && !receipt) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "RECONCILED_SUCCESS_WITHOUT_USABLE_RECEIPT",
      providerLookupPerformed: true,
      persisted: false,
      status: "UNKNOWN",
    };
  }
  if (lookup.state === "SUCCEEDED" && !hasProviderReceiptReference(receipt)) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "RECONCILED_SUCCESS_WITHOUT_CORRELATABLE_RECEIPT",
      providerLookupPerformed: true,
      persisted: false,
      status: "UNKNOWN",
    };
  }

  const reconciliation = {
    authoritative: true,
    method: lookup.method,
    provider_state: lookup.providerState,
    result: finalStatus,
    checked_at: lookup.checkedAt,
  };
  const evidence = {
    reconciliation,
    verified: false,
    ...(receipt ? { provider_receipt: receipt } : {}),
    ...(finalStatus === "FAILED" ? { provider_not_sent: true, safe_to_retry: true } : { safe_to_retry: false }),
  };
  let response;
  try {
    response = await client.rpc("reconcile_agent_execution_outcome", {
      p_execution_id: executionId,
      p_claim_token: claim.reconciliationClaimToken,
      p_status: finalStatus,
      p_result: { outcome: finalStatus, reconciliation_method: lookup.method },
      p_evidence: evidence,
    });
  } catch {
    response = { error: { message: "RECONCILIATION_PERSISTENCE_UNCONFIRMED" } };
  }
  const finalRow = rowFrom(response?.data);
  if (response?.error || !finalRow || finalRow.id !== executionId || finalRow.status !== finalStatus) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "RECONCILIATION_PERSISTENCE_UNCONFIRMED",
      providerLookupPerformed: true,
      persisted: false,
      status: "UNKNOWN",
    };
  }

  return {
    decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILED,
    executionId,
    reasonCode: finalStatus === "SUCCEEDED" ? "PROVIDER_SUCCESS_RECONCILED" : "PROVIDER_NO_SEND_RECONCILED",
    providerLookupPerformed: true,
    persisted: true,
    status: finalStatus,
    safeToRetry: finalStatus === "FAILED",
  };
}

/**
 * Atomically claim one dispatch, then invoke the injected trusted adapter exactly
 * once. Any uncertainty after the adapter call is UNKNOWN and is never retried
 * here. This is a seam for a future worker, not a real-provider integration.
 */
export async function dispatchThroughJitClaim({ client, adapter, executionId }) {
  if (!nonEmpty(executionId) || !client || typeof client.rpc !== "function"
      || !adapter || typeof adapter.dispatch !== "function" || !nonEmpty(adapter.audience)) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.DENY,
      executionId: nonEmpty(executionId) ? executionId : null,
      reasonCode: "INVALID_DISPATCH_GATEWAY_CONFIGURATION",
      dispatched: false,
      persisted: false,
      status: null,
    };
  }

  let claimResponse;
  try {
    claimResponse = await client.rpc("claim_agent_execution_dispatch", {
      p_execution_id: executionId,
    });
  } catch {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "DISPATCH_CLAIM_OUTCOME_UNKNOWN",
      dispatched: false,
      persisted: false,
      status: null,
    };
  }

  if (claimResponse?.error) {
    const denial = knownDenialCode(claimResponse.error);
    return {
      decision: denial ? PERSISTENT_DISPATCH_DECISIONS.DENY : PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: denial || "DISPATCH_CLAIM_OUTCOME_UNKNOWN",
      dispatched: false,
      persisted: false,
      status: null,
    };
  }

  const claimRow = rowFrom(claimResponse?.data);
  if (!validClaim(claimRow, executionId)) {
    // A successful RPC may have committed the one-time claim even if its
    // returned representation is malformed. We know this gateway did not call
    // the adapter, so record a trusted not-sent block rather than retry blindly.
    const leaseExpiry = Date.parse(claimRow?.lease_expires_at ?? "");
    const reasonCode = Number.isFinite(leaseExpiry) && leaseExpiry <= Date.now()
      ? "DISPATCH_CLAIM_LEASE_EXPIRED_BEFORE_PROVIDER_IO"
      : "INVALID_DISPATCH_CLAIM_RECORD";
    return blockBeforeDispatch(client, executionId, reasonCode);
  }

  if (adapter.audience !== claimRow.request.audience) {
    return blockBeforeDispatch(client, executionId, "PROVIDER_AUDIENCE_MISMATCH", claimEnvelope(claimRow));
  }

  const claim = claimEnvelope(claimRow);
  let providerResult;
  try {
    // No additional RPCs/awaits between claim validation and this adapter call.
    providerResult = await adapter.dispatch(claim);
  } catch {
    // An exception/timeout may occur after the provider accepted the request.
    return recordUnknown(client, executionId, claim, "PROVIDER_OUTCOME_UNKNOWN");
  }

  if (!record(providerResult)
      || !["SUCCEEDED", "FAILED", "ACCEPTED", "UNKNOWN"].includes(providerResult.state)) {
    return recordUnknown(client, executionId, claim, "INVALID_PROVIDER_OUTCOME");
  }

  const receipt = sanitiseProviderReceipt(providerResult.receipt);
  const providerNotSent = providerResult.state === "FAILED"
    && providerResult.providerNotSent === true
    && providerResult.safeToRetry === true;

  if (providerResult.state === "SUCCEEDED" && !receipt) {
    return recordUnknown(client, executionId, claim, "SUCCESS_WITHOUT_USABLE_PROVIDER_RECEIPT");
  }
  if (providerResult.state === "SUCCEEDED" && !hasProviderReceiptReference(receipt)) {
    return recordUnknown(client, executionId, claim, "SUCCESS_WITHOUT_CORRELATABLE_PROVIDER_RECEIPT", receipt);
  }

  if (providerResult.state === "ACCEPTED" || providerResult.state === "UNKNOWN") {
    return recordUnknown(client, executionId, claim, "PROVIDER_OUTCOME_REQUIRES_RECONCILIATION", receipt);
  }

  const requestedStatus = providerResult.state === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
  const evidence = finaliseResult(requestedStatus, receipt, "PROVIDER_RESULT_RECORDED", claim, {
    outcome: requestedStatus,
    safe_to_retry: providerNotSent,
    ...(providerNotSent ? { provider_not_sent: true } : {}),
    reconciliation_required: !providerNotSent && requestedStatus === "FAILED",
  });
  const settlement = await complete(
    client,
    executionId,
    requestedStatus,
    {
      gateway: "persistent_w69",
      outcome: requestedStatus,
      reference: receipt?.id ?? receipt?.reference ?? receipt?.request_id ?? null,
    },
    evidence,
    providerNotSent ? "PROVIDER_CONFIRMED_NOT_SENT" : null,
    providerNotSent ? "The trusted adapter proved the request did not cross the provider boundary." : null,
  );

  if (!settlement.ok) {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
      executionId,
      reasonCode: "COMPLETION_PERSISTENCE_UNCONFIRMED",
      dispatched: true,
      persisted: false,
      status: null,
    };
  }

  if (settlement.row.status === "SUCCEEDED") {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.DISPATCHED,
      executionId,
      reasonCode: "PROVIDER_RECEIPT_RECORDED",
      dispatched: true,
      persisted: true,
      status: "SUCCEEDED",
      receipt,
    };
  }
  if (settlement.row.status === "FAILED") {
    return {
      decision: PERSISTENT_DISPATCH_DECISIONS.DENY,
      executionId,
      reasonCode: "PROVIDER_CONFIRMED_NOT_SENT",
      dispatched: true,
      persisted: true,
      status: "FAILED",
    };
  }
  return {
    decision: PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED,
    executionId,
    reasonCode: "EXTERNAL_OUTCOME_REQUIRES_RECONCILIATION",
    dispatched: true,
    persisted: true,
    status: settlement.row.status,
  };
}

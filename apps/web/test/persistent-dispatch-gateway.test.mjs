import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchThroughJitClaim,
  reconcileThroughTrustedClaim,
  PERSISTENT_DISPATCH_DECISIONS,
  sanitiseProviderReceipt,
} from "../lib/mission-authority/persistent-dispatch-gateway.mjs";

const EXECUTION_ID = "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1";
// Keep ordinary success fixtures valid on reruns, regardless of wall-clock date.
const CLAIM_TIME = new Date(Date.now() - 30_000).toISOString();
const LEASE_EXPIRY = new Date(Date.now() + 5 * 60_000).toISOString();

function validClaim(overrides = {}) {
  return {
    id: EXECUTION_ID,
    status: "RUNNING",
    workspace_id: "workspace-a",
    mission_id: "mission-a",
    action_id: "action-a",
    agent_id: "agent-a",
    approval_id: "approval-a",
    idempotency_key: "w69-unit-test-key-0001",
    lease_expires_at: LEASE_EXPIRY,
    authority_snapshot: {
      external_side_effects: true,
      requires_approval: true,
    },
    request: {
      destination: "https://provider.example.test/send",
      audience: "provider.send.v1",
      summary: "Send the approved test message",
      payload: { message: "hello" },
    },
    dispatch_claimed_at: CLAIM_TIME,
    dispatch_claim_authority_hash: "a".repeat(64),
    dispatch_claim_request_hash: "b".repeat(64),
    dispatch_claim_budget_revision: 7,
    ...overrides,
  };
}

function fakeClient({ claim = validClaim(), claimError = null, completion = null, completionError = null } = {}) {
  const calls = [];
  const completionRow = completion ?? {
    id: EXECUTION_ID,
    status: "SUCCEEDED",
  };
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_agent_execution_dispatch") {
        return { data: claimError ? null : claim, error: claimError };
      }
      if (name === "complete_agent_execution") {
        return {
          data: completionError ? null : completionRow,
          error: completionError,
        };
      }
      throw new Error("UNEXPECTED_RPC");
    },
  };
}

function fakeAdapter({ result, error } = {}) {
  const calls = [];
  return {
    calls,
    audience: "provider.send.v1",
    async dispatch(claim) {
      calls.push(claim);
      if (error) throw error;
      return result ?? {
        state: "SUCCEEDED",
        receipt: { id: "provider-reference-1", status: "created", secret: "must-not-persist" },
      };
    },
  };
}

test("a valid claim is validated before exactly one adapter call and trusted completion", async () => {
  const client = fakeClient();
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DISPATCHED);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(client.calls.map((x) => x.name), [
    "claim_agent_execution_dispatch",
    "complete_agent_execution",
  ]);
  assert.equal(adapter.calls[0].idempotencyKey, "w69-unit-test-key-0001");
  assert.equal(adapter.calls[0].authorityHash, "a".repeat(64));
  assert.equal(adapter.calls[0].requestHash, "b".repeat(64));
  assert.equal(client.calls[1].args.p_status, "SUCCEEDED");
  assert.deepEqual(client.calls[1].args.p_evidence.provider_receipt, {
    id: "provider-reference-1",
    status: "created",
  });
  assert.equal("secret" in client.calls[1].args.p_evidence.provider_receipt, false);
});

test("dispatch adapter receives a deeply immutable approved request", async () => {
  const request = {
    ...validClaim().request,
    payload: { message: "approved", metadata: { recipients: ["one", "two"] } },
  };
  const client = fakeClient({ claim: validClaim({ request }) });
  const adapter = fakeAdapter();
  adapter.dispatch = async (claim) => {
    adapter.calls.push(claim);
    assert.equal(Object.isFrozen(claim), true);
    assert.equal(Object.isFrozen(claim.request), true);
    assert.equal(Object.isFrozen(claim.request.payload), true);
    assert.equal(Object.isFrozen(claim.request.payload.metadata), true);
    assert.equal(Object.isFrozen(claim.request.payload.metadata.recipients), true);
    assert.throws(() => { claim.request.payload.metadata.recipients.push("unapproved"); }, TypeError);
    assert.throws(() => { claim.request.payload.message = "tampered"; }, TypeError);
    assert.deepEqual(claim.request.payload.metadata.recipients, ["one", "two"]);
    return { state: "SUCCEEDED", receipt: { id: "immutable-request-receipt" } };
  };

  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });
  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DISPATCHED);
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls[1].args.p_evidence.provider_receipt.id, "immutable-request-receipt");
});

test("known JIT denial blocks before adapter dispatch", async () => {
  const client = fakeClient({ claimError: { message: "APPROVAL_REQUIRED_OR_SCOPE_CHANGED" } });
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DENY);
  assert.equal(result.reasonCode, "APPROVAL_REQUIRED_OR_SCOPE_CHANGED");
  assert.equal(result.dispatched, false);
  assert.equal(adapter.calls.length, 0);
  assert.equal(client.calls.length, 1);
});

test("unknown claim RPC failure never dispatches or retries automatically", async () => {
  const client = {
    calls: [],
    async rpc(name) {
      this.calls.push(name);
      throw new Error("network timeout; commit status unknown");
    },
  };
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "DISPATCH_CLAIM_OUTCOME_UNKNOWN");
  assert.equal(adapter.calls.length, 0);
  assert.deepEqual(client.calls, ["claim_agent_execution_dispatch"]);
});

test("malformed claimed row records a not-sent block without invoking the adapter", async () => {
  const client = fakeClient({ claim: { ...validClaim(), dispatch_claim_request_hash: "" }, completion: {
    id: EXECUTION_ID, status: "BLOCKED",
  } });
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DENY);
  assert.equal(result.reasonCode, "INVALID_DISPATCH_CLAIM_RECORD");
  assert.equal(adapter.calls.length, 0);
  assert.equal(client.calls[1].args.p_status, "BLOCKED");
  assert.equal(client.calls[1].args.p_evidence.provider_not_sent, true);
  assert.equal(client.calls[1].args.p_evidence.safe_to_retry, true);
});

test("each mandatory dispatch-claim authority binding fails closed before provider I/O", async () => {
  const baseline = validClaim();
  const cases = [
    ["execution id mismatch", validClaim({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })],
    ["claim is not RUNNING", validClaim({ status: "SUCCEEDED" })],
    ["missing dispatch timestamp", validClaim({ dispatch_claimed_at: "" })],
    ["invalid dispatch timestamp", validClaim({ dispatch_claimed_at: "not-a-timestamp" })],
    ["invalid lease timestamp", validClaim({ lease_expires_at: "not-a-timestamp" })],
    ["claim timestamp is not before lease expiry", validClaim({
      dispatch_claimed_at: new Date(Date.now() + 60_000).toISOString(),
      lease_expires_at: new Date(Date.now() + 30_000).toISOString(),
    })],
    ["malformed authority hash", validClaim({ dispatch_claim_authority_hash: "a".repeat(63) })],
    ["malformed request hash", validClaim({ dispatch_claim_request_hash: "g".repeat(64) })],
    ["invalid budget revision", validClaim({ dispatch_claim_budget_revision: "not-a-revision" })],
    ["zero budget revision", validClaim({ dispatch_claim_budget_revision: 0 })],
    ["missing idempotency key", validClaim({ idempotency_key: " " })],
    ["request is not a record", validClaim({ request: null })],
    ["authority snapshot is not a record", validClaim({ authority_snapshot: null })],
    ["external side effects are not authorized", validClaim({
      authority_snapshot: { ...baseline.authority_snapshot, external_side_effects: false },
    })],
    ["approval requirement is absent", validClaim({
      authority_snapshot: { ...baseline.authority_snapshot, requires_approval: false },
    })],
    ["action id is missing", validClaim({ action_id: "" })],
    ["approval id is missing", validClaim({ approval_id: "" })],
    ["destination is missing", validClaim({
      request: { ...baseline.request, destination: "" },
    })],
    ["provider audience is missing", validClaim({
      request: { ...baseline.request, audience: "" },
    })],
  ];

  for (const [name, claim] of cases) {
    const client = fakeClient({
      claim,
      completion: { id: EXECUTION_ID, status: "BLOCKED" },
    });
    const adapter = fakeAdapter();
    const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

    assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DENY, name);
    assert.equal(result.reasonCode, "INVALID_DISPATCH_CLAIM_RECORD", name);
    assert.equal(adapter.calls.length, 0, `${name}: adapter must not be called`);
    assert.equal(client.calls.length, 2, `${name}: the malformed claim is settled as blocked`);
    assert.equal(client.calls[0].name, "claim_agent_execution_dispatch", name);
    assert.equal(client.calls[1].args.p_status, "BLOCKED", name);
    assert.equal(client.calls[1].args.p_evidence.provider_not_sent, true, name);
    assert.equal(client.calls[1].args.p_evidence.safe_to_retry, true, name);
  }
});

test("expired dispatch claim never reaches the provider adapter", async () => {
  const client = fakeClient({
    claim: validClaim({ lease_expires_at: new Date(Date.now() - 1_000).toISOString() }),
    completionError: { message: "EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION" },
  });
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "PRE_DISPATCH_BLOCK_SETTLEMENT_UNCONFIRMED");
  assert.equal(result.blockReasonCode, "DISPATCH_CLAIM_LEASE_EXPIRED_BEFORE_PROVIDER_IO");
  assert.equal(result.dispatched, false);
  assert.equal(result.persisted, false);
  assert.equal(adapter.calls.length, 0);
  assert.equal(client.calls[1].args.p_status, "BLOCKED");
});

test("provider audience mismatch blocks after claim but before provider I/O", async () => {
  const client = fakeClient({
    claim: validClaim({ request: { ...validClaim().request, audience: "provider.other.v1" } }),
    completion: { id: EXECUTION_ID, status: "BLOCKED" },
  });
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DENY);
  assert.equal(result.reasonCode, "PROVIDER_AUDIENCE_MISMATCH");
  assert.equal(result.dispatched, false);
  assert.equal(adapter.calls.length, 0);
  assert.equal(client.calls[1].args.p_status, "BLOCKED");
  assert.equal(client.calls[1].args.p_evidence.provider_not_sent, true);
});

test("adapter timeout becomes UNKNOWN and there is no second provider call", async () => {
  const client = fakeClient({ completion: { id: EXECUTION_ID, status: "UNKNOWN" } });
  const adapter = fakeAdapter({ error: new Error("socket timeout") });
  const first = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(first.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(first.status, "UNKNOWN");
  assert.equal(first.persisted, true);
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls[1].args.p_status, "UNKNOWN");
  assert.equal(client.calls[1].args.p_evidence.safe_to_retry, false);
  assert.equal(client.calls[1].args.p_evidence.reconciliation_required, true);

  client.rpc = async (name, args) => {
    client.calls.push({ name, args });
    if (name === "claim_agent_execution_dispatch") {
      return { data: null, error: { message: "EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH" } };
    }
    throw new Error("no second completion expected");
  };
  const retry = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });
  assert.equal(retry.decision, PERSISTENT_DISPATCH_DECISIONS.DENY);
  assert.equal(adapter.calls.length, 1);
});

test("a successful provider state without a safe receipt stays UNKNOWN", async () => {
  const client = fakeClient({ completion: { id: EXECUTION_ID, status: "UNKNOWN" } });
  const adapter = fakeAdapter({ result: {
    state: "SUCCEEDED",
    receipt: { token: "secret", nested: { id: "not-allowlisted" } },
  } });
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "SUCCESS_WITHOUT_USABLE_PROVIDER_RECEIPT");
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls[1].args.p_status, "UNKNOWN");
});

test("nominal success without a stable provider reference remains UNKNOWN", async () => {
  const uncorrelatableReceipts = [
    { status: "ok" },
    { provider: "resend" },
    { charge_amount: 2, currency: "USD" },
  ];

  for (const receipt of uncorrelatableReceipts) {
    const client = fakeClient({ completion: { id: EXECUTION_ID, status: "UNKNOWN" } });
    const adapter = fakeAdapter({ result: { state: "SUCCEEDED", receipt } });
    const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });
    assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
    assert.equal(result.reasonCode, "SUCCESS_WITHOUT_CORRELATABLE_PROVIDER_RECEIPT");
    assert.equal(result.status, "UNKNOWN");
    assert.equal(adapter.calls.length, 1);
    assert.equal(client.calls[1].args.p_status, "UNKNOWN");
    assert.equal(client.calls[1].args.p_evidence.safe_to_retry, false);
    assert.equal(client.calls[1].args.p_evidence.reconciliation_required, true);
  }
});

test("accepted provider result is reconciled rather than reported as success", async () => {
  const client = fakeClient({ completion: { id: EXECUTION_ID, status: "UNKNOWN" } });
  const adapter = fakeAdapter({ result: {
    state: "ACCEPTED",
    receipt: { request_id: "provider-request-1", payload: "do not persist" },
  } });
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(client.calls[1].args.p_evidence.provider_receipt, {
    request_id: "provider-request-1",
  });
});

test("provider failure without explicit not-sent proof remains unknown", async () => {
  const client = fakeClient({ completion: { id: EXECUTION_ID, status: "UNKNOWN" } });
  const adapter = fakeAdapter({ result: {
    state: "FAILED",
    receipt: { id: "error-reference", status: "rejected" },
  } });
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.status, "UNKNOWN");
  assert.equal(client.calls[1].args.p_status, "FAILED");
  assert.equal(client.calls[1].args.p_evidence.provider_not_sent, undefined);
  assert.equal(client.calls[1].args.p_evidence.safe_to_retry, false);
});

test("provider failure with trusted not-sent proof is a confirmed failure, never an automatic retry", async () => {
  const client = fakeClient({ completion: { id: EXECUTION_ID, status: "FAILED" } });
  const adapter = fakeAdapter({ result: {
    state: "FAILED",
    providerNotSent: true,
    safeToRetry: true,
    receipt: { status: "rejected" },
  } });
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DENY);
  assert.equal(result.status, "FAILED");
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls[1].args.p_evidence.provider_not_sent, true);
  assert.equal(client.calls[1].args.p_evidence.safe_to_retry, true);
});

test("RPC completion ambiguity never calls the provider adapter a second time", async () => {
  const client = fakeClient({ completionError: { message: "response lost after commit" } });
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "COMPLETION_PERSISTENCE_UNCONFIRMED");
  assert.equal(result.dispatched, true);
  assert.equal(result.persisted, false);
  assert.equal(adapter.calls.length, 1);
});

test("provider receipts are allowlisted and contain only bounded scalar references", () => {
  assert.deepEqual(sanitiseProviderReceipt({
    id: "ref-1",
    status: "accepted",
    secret: "no",
    customer: { email: "never-store-this" },
    request_id: "request-1",
    huge: "x".repeat(501),
  }), {
    id: "ref-1",
    status: "accepted",
    request_id: "request-1",
  });
  assert.equal(sanitiseProviderReceipt({ token: "secret", unknown: { id: "nested" } }), null);
});

test("paid-action receipt keeps bounded charge and currency for atomic budget settlement", async () => {
  assert.deepEqual(sanitiseProviderReceipt({
    id: "provider-payment-7",
    charge_amount: 12.5,
    currency: "NOK",
    secret: "never-persist",
  }), {
    id: "provider-payment-7",
    charge_amount: 12.5,
    currency: "NOK",
  });

  const client = fakeClient();
  const adapter = fakeAdapter({ result: {
    state: "SUCCEEDED",
    receipt: {
      id: "provider-payment-7",
      charge_amount: 12.5,
      currency: "NOK",
      secret: "never-persist",
    },
  } });
  await dispatchThroughJitClaim({ client, adapter, executionId: EXECUTION_ID });
  assert.deepEqual(client.calls[1].args.p_evidence.provider_receipt, {
    id: "provider-payment-7",
    charge_amount: 12.5,
    currency: "NOK",
  });
});

test("invalid charge amounts and currencies are removed from persisted receipts", () => {
  assert.deepEqual(sanitiseProviderReceipt({
    id: "provider-payment-8",
    charge_amount: -1,
    currency: "Nok",
  }), {
    id: "provider-payment-8",
  });
  assert.deepEqual(sanitiseProviderReceipt({
    id: "provider-payment-9",
    charge_amount: "12.5",
    currency: "NO",
  }), {
    id: "provider-payment-9",
  });
});

const RECONCILIATION_DISPATCHED_AT = new Date(Date.now() - 60_000).toISOString();
const RECONCILIATION_CREATED_AT = new Date(Date.now() - 120_000).toISOString();
const RECONCILIATION_CLAIMED_AT = new Date(Date.now() - 20_000).toISOString();
const RECONCILIATION_LEASE_EXPIRY = new Date(Date.now() + 5 * 60_000).toISOString();

function validReconciliationClaim(overrides = {}) {
  return {
    id: EXECUTION_ID,
    status: "UNKNOWN",
    workspace_id: "workspace-a",
    mission_id: "mission-a",
    action_id: "action-a",
    agent_id: "agent-a",
    approval_id: "approval-a",
    idempotency_key: "w70-unit-test-key-0001",
    created_at: RECONCILIATION_CREATED_AT,
    dispatch_claimed_at: RECONCILIATION_DISPATCHED_AT,
    dispatch_claim_authority_hash: "a".repeat(64),
    dispatch_claim_request_hash: "b".repeat(64),
    dispatch_claim_budget_revision: 7,
    authority_snapshot: { external_side_effects: true, requires_approval: true },
    request: {
      destination: "https://provider.example.test/send",
      audience: "provider.send.v1",
      payload: { message: "approved payload" },
    },
    reconciliation_claimed_at: RECONCILIATION_CLAIMED_AT,
    reconciliation_lease_expires_at: RECONCILIATION_LEASE_EXPIRY,
    reconciliation_claim_token: "token-w70-claim-1",
    ...overrides,
  };
}

function fakeReconciliationClient({ claim = validReconciliationClaim(), claimError = null, finalRow = null, finalError = null } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_agent_execution_reconciliation") {
        return { data: claimError ? null : claim, error: claimError };
      }
      if (name === "reconcile_agent_execution_outcome") {
        return {
          data: finalError ? null : (finalRow ?? {
            id: EXECUTION_ID,
            status: args.p_status,
            reconciled_at: "2099-01-01T10:01:00.000Z",
          }),
          error: finalError,
        };
      }
      throw new Error("UNEXPECTED_RECONCILIATION_RPC");
    },
  };
}

function fakeReconciler({ result, error } = {}) {
  const calls = [];
  return {
    calls,
    audience: "provider.send.v1",
    async reconcile(claim) {
      calls.push(claim);
      if (error) throw error;
      return result ?? {
        state: "SUCCEEDED",
        authoritative: true,
        method: "provider_lookup",
        providerState: "succeeded",
        checkedAt: new Date().toISOString(),
        receipt: { id: "reconciled-provider-ref", charge_amount: 2.5, currency: "NOK" },
      };
    },
  };
}


test("malformed or unbound reconciliation claims never trigger provider lookup", async () => {
  const baseline = validReconciliationClaim();
  const cases = [
    ["execution id mismatch", validReconciliationClaim({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })],
    ["claim is not UNKNOWN", validReconciliationClaim({ status: "RUNNING" })],
    ["external side effects are not in scope", validReconciliationClaim({
      authority_snapshot: { ...baseline.authority_snapshot, external_side_effects: false },
    })],
    ["action id is missing", validReconciliationClaim({ action_id: "" })],
    ["idempotency key is missing", validReconciliationClaim({ idempotency_key: "" })],
    ["request is not a record", validReconciliationClaim({ request: null })],
    ["destination is missing", validReconciliationClaim({
      request: { ...baseline.request, destination: "" },
    })],
    ["provider audience is missing", validReconciliationClaim({
      request: { ...baseline.request, audience: "" },
    })],
    ["reconciliation claim token is missing", validReconciliationClaim({ reconciliation_claim_token: "" })],
    ["reconciliation claimed timestamp is missing", validReconciliationClaim({ reconciliation_claimed_at: "" })],
    ["reconciliation claimed timestamp is invalid", validReconciliationClaim({ reconciliation_claimed_at: "not-a-timestamp" })],
    ["reconciliation lease expiry is missing", validReconciliationClaim({ reconciliation_lease_expires_at: "" })],
    ["reconciliation lease expiry is invalid", validReconciliationClaim({ reconciliation_lease_expires_at: "not-a-timestamp" })],
    ["reconciliation lease is already expired", validReconciliationClaim({
      reconciliation_lease_expires_at: new Date(Date.now() - 1_000).toISOString(),
    })],
    ["reconciliation claim is at or after lease expiry", validReconciliationClaim({
      reconciliation_claimed_at: new Date(Date.now() + 60_000).toISOString(),
      reconciliation_lease_expires_at: new Date(Date.now() + 30_000).toISOString(),
    })],
    ["dispatch bound timestamp is absent", validReconciliationClaim({
      dispatch_claimed_at: "",
      created_at: "",
    })],
    ["dispatch bound timestamp is invalid", validReconciliationClaim({
      dispatch_claimed_at: "not-a-timestamp",
    })],
    ["reconciliation claim predates its dispatch bound", validReconciliationClaim({
      dispatch_claimed_at: new Date(Date.now() + 60_000).toISOString(),
    })],
    ["recorded dispatch is missing approval id", validReconciliationClaim({ approval_id: "" })],
    ["recorded dispatch authority snapshot does not require approval", validReconciliationClaim({
      authority_snapshot: { external_side_effects: true, requires_approval: false },
    })],
    ["partial authority hash without dispatch timestamp is not legacy", validReconciliationClaim({
      dispatch_claimed_at: null,
      dispatch_claim_authority_hash: "a".repeat(64),
    })],
    ["partial request hash without dispatch timestamp is not legacy", validReconciliationClaim({
      dispatch_claimed_at: null,
      dispatch_claim_request_hash: "b".repeat(64),
    })],
    ["partial budget revision without dispatch timestamp is not legacy", validReconciliationClaim({
      dispatch_claimed_at: null,
      dispatch_claim_budget_revision: 7,
    })],
    ["recorded dispatch authority hash is missing", validReconciliationClaim({ dispatch_claim_authority_hash: "" })],
    ["recorded dispatch request hash is malformed", validReconciliationClaim({ dispatch_claim_request_hash: "z".repeat(64) })],
    ["recorded dispatch budget revision is missing", validReconciliationClaim({ dispatch_claim_budget_revision: null })],
    ["recorded dispatch budget revision is not positive", validReconciliationClaim({ dispatch_claim_budget_revision: 0 })],
  ];

  for (const [name, claim] of cases) {
    const client = fakeReconciliationClient({ claim });
    const adapter = fakeReconciler();
    const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

    assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED, name);
    assert.equal(result.reasonCode, "INVALID_RECONCILIATION_CLAIM_RECORD", name);
    assert.equal(result.providerLookupPerformed, false, name);
    assert.equal(result.persisted, false, name);
    assert.equal(adapter.calls.length, 0, name + ": provider lookup must not run");
    assert.deepEqual(client.calls.map((call) => call.name), ["claim_agent_execution_reconciliation"], name);
  }
});

test("reconciliation audience mismatch never calls the wrong provider adapter", async () => {
  const client = fakeReconciliationClient({
    claim: validReconciliationClaim({ request: { ...validReconciliationClaim().request, audience: "provider.other.v1" } }),
  });
  const adapter = fakeReconciler();
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "PROVIDER_AUDIENCE_MISMATCH");
  assert.equal(result.providerLookupPerformed, false);
  assert.equal(adapter.calls.length, 0);
  assert.equal(client.calls.length, 1);
});

test("reconciliation adapter receives a deeply immutable approved request", async () => {
  const originalClaim = validReconciliationClaim({
    request: {
      ...validReconciliationClaim().request,
      payload: { message: "approved", metadata: { recipients: ["one", "two"] } },
    },
  });
  const client = fakeReconciliationClient({ claim: originalClaim });
  const adapter = fakeReconciler();
  adapter.reconcile = async (claim) => {
    adapter.calls.push(claim);
    assert.equal(Object.isFrozen(claim), true);
    assert.equal(Object.isFrozen(claim.request), true);
    assert.equal(Object.isFrozen(claim.request.payload), true);
    assert.equal(Object.isFrozen(claim.request.payload.metadata), true);
    assert.equal(Object.isFrozen(claim.request.payload.metadata.recipients), true);
    assert.throws(() => { claim.request.payload.metadata.recipients.reverse(); }, TypeError);
    assert.throws(() => { claim.request.payload.message = "tampered"; }, TypeError);
    assert.deepEqual(claim.request.payload.metadata.recipients, ["one", "two"]);
    return { state: "UNKNOWN" };
  };

  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });
  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "PROVIDER_OUTCOME_STILL_UNKNOWN");
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls.length, 1, "an unknown lookup must not be persisted as a terminal state");
});

test("authoritative provider lookup reconciles UNKNOWN success without dispatching", async () => {
  const client = fakeReconciliationClient();
  const adapter = fakeReconciler();
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILED);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.providerLookupPerformed, true);
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.calls[0].idempotencyKey, "w70-unit-test-key-0001");
  assert.equal(adapter.calls[0].reconciliationClaimToken, "token-w70-claim-1");
  assert.equal(adapter.calls[0].reconciliationClaimedAt, RECONCILIATION_CLAIMED_AT);
  assert.equal(client.calls.map((x) => x.name).join(","), "claim_agent_execution_reconciliation,reconcile_agent_execution_outcome");
  assert.equal(client.calls[1].args.p_status, "SUCCEEDED");
  assert.deepEqual(client.calls[1].args.p_evidence.provider_receipt, {
    id: "reconciled-provider-ref",
    charge_amount: 2.5,
    currency: "NOK",
  });
  assert.equal(client.calls[1].args.p_evidence.verified, false);
});

test("stale provider lookup cannot finalize or release an UNKNOWN execution", async () => {
  const client = fakeReconciliationClient();
  const adapter = fakeReconciler({ result: {
    state: "NOT_SENT",
    authoritative: true,
    method: "idempotency_key_lookup",
    providerState: "not_found",
    checkedAt: new Date(Date.now() - 120_000).toISOString(),
  } });
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "AUTHORITATIVE_LOOKUP_EVIDENCE_REQUIRED");
  assert.equal(result.providerLookupPerformed, true);
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls.length, 1);
});

test("lookup timestamp must be newer than the current reconciliation claim", async () => {
  const claim = validReconciliationClaim();
  const checkedAt = new Date(Date.parse(claim.reconciliation_claimed_at) - 1_000).toISOString();
  const client = fakeReconciliationClient({ claim });
  const adapter = fakeReconciler({ result: {
    state: "NOT_SENT",
    authoritative: true,
    method: "idempotency_key_lookup",
    providerState: "not_found",
    checkedAt,
  } });
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "AUTHORITATIVE_LOOKUP_EVIDENCE_REQUIRED");
  assert.equal(result.providerLookupPerformed, true);
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls.length, 1, "stale evidence must not be persisted as a final outcome");
});

test("authoritative no-send reconciliation releases the held reservation through FAILED", async () => {
  const client = fakeReconciliationClient();
  const adapter = fakeReconciler({ result: {
    state: "NOT_SENT",
    authoritative: true,
    method: "idempotency_key_lookup",
    providerState: "not_found",
    checkedAt: new Date().toISOString(),
  } });
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILED);
  assert.equal(result.status, "FAILED");
  assert.equal(result.safeToRetry, true);
  assert.equal(client.calls[1].args.p_evidence.provider_not_sent, true);
  assert.equal(client.calls[1].args.p_evidence.safe_to_retry, true);
});

test("unknown provider lookup leaves execution UNKNOWN and does not settle it", async () => {
  const client = fakeReconciliationClient();
  const adapter = fakeReconciler({ result: { state: "UNKNOWN" } });
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.status, "UNKNOWN");
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls.length, 1);
});

test("provider lookup exception does not retry or finalize", async () => {
  const client = fakeReconciliationClient();
  const adapter = fakeReconciler({ error: new Error("provider lookup timeout") });
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.reasonCode, "PROVIDER_RECONCILIATION_UNAVAILABLE");
  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls.length, 1);
});

test("active reconciliation lease prevents a second worker from looking up provider state", async () => {
  const client = fakeReconciliationClient({ claimError: { message: "EXECUTION_RECONCILIATION_ALREADY_CLAIMED" } });
  const adapter = fakeReconciler();
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "RECONCILIATION_ALREADY_CLAIMED");
  assert.equal(adapter.calls.length, 0);
});

test("terminal reconciliation replay returns stored status without another provider lookup", async () => {
  const client = fakeReconciliationClient({ claim: validReconciliationClaim({
    status: "SUCCEEDED",
    reconciled_at: "2099-01-01T10:01:00.000Z",
    evidence: { reconciliation: { method: "provider_lookup" } },
  }) });
  const adapter = fakeReconciler();
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILED);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.providerLookupPerformed, false);
  assert.equal(adapter.calls.length, 0);
  assert.equal(client.calls.length, 1);
});

test("reconciliation success without a usable receipt remains UNKNOWN", async () => {
  const client = fakeReconciliationClient();
  const adapter = fakeReconciler({ result: {
    state: "SUCCEEDED",
    authoritative: true,
    method: "receipt_lookup",
    providerState: "succeeded",
    checkedAt: new Date().toISOString(),
    receipt: { token: "private", nested: { id: "not-allowlisted" } },
  } });
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.reasonCode, "RECONCILED_SUCCESS_WITHOUT_USABLE_RECEIPT");
  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(client.calls.length, 1);
});

test("reconciled success without a stable provider reference remains UNKNOWN", async () => {
  const uncorrelatableReceipts = [
    { status: "ok" },
    { provider: "resend" },
    { charge_amount: 2, currency: "USD" },
  ];
  for (const receipt of uncorrelatableReceipts) {
    const client = fakeReconciliationClient();
    const adapter = fakeReconciler({ result: {
      state: "SUCCEEDED",
      authoritative: true,
      method: "receipt_lookup",
      providerState: "succeeded",
      checkedAt: new Date().toISOString(),
      receipt,
    } });
    const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });
    assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
    assert.equal(result.reasonCode, "RECONCILED_SUCCESS_WITHOUT_CORRELATABLE_RECEIPT");
    assert.equal(result.status, "UNKNOWN");
    assert.equal(adapter.calls.length, 1);
    assert.equal(client.calls.length, 1, "must not persist an uncorrelatable success");
    assert.equal(client.calls[0].name, "claim_agent_execution_reconciliation");
  }
});

test("reconciliation persistence ambiguity never invokes provider lookup twice", async () => {
  const client = fakeReconciliationClient({ finalError: { message: "response lost after commit" } });
  const adapter = fakeReconciler();
  const result = await reconcileThroughTrustedClaim({ client, adapter, executionId: EXECUTION_ID });

  assert.equal(result.reasonCode, "RECONCILIATION_PERSISTENCE_UNCONFIRMED");
  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(adapter.calls.length, 1);
  assert.equal(client.calls.length, 2);
});

test("invalid configuration fails before making any RPC or provider call", async () => {
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client: null, adapter, executionId: EXECUTION_ID });
  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DENY);
  assert.equal(result.reasonCode, "INVALID_DISPATCH_GATEWAY_CONFIGURATION");
  assert.equal(adapter.calls.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchThroughJitClaim,
  PERSISTENT_DISPATCH_DECISIONS,
  sanitiseProviderReceipt,
} from "../lib/mission-authority/persistent-dispatch-gateway.mjs";

const EXECUTION_ID = "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1";
const LEASE_EXPIRY = "2026-10-12T10:05:00.000Z";
const CLAIM_TIME = "2026-10-12T10:00:00.000Z";

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

test("invalid configuration fails before making any RPC or provider call", async () => {
  const adapter = fakeAdapter();
  const result = await dispatchThroughJitClaim({ client: null, adapter, executionId: EXECUTION_ID });
  assert.equal(result.decision, PERSISTENT_DISPATCH_DECISIONS.DENY);
  assert.equal(result.reasonCode, "INVALID_DISPATCH_GATEWAY_CONFIGURATION");
  assert.equal(adapter.calls.length, 0);
});

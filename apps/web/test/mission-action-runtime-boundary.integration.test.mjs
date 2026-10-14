import assert from "node:assert/strict";
import test from "node:test";

import { runMissionActionWorker } from "../lib/mission-authority/mission-action-worker-boundary.mjs";
import {
  dispatchThroughJitClaim,
  reconcileThroughTrustedClaim,
  PERSISTENT_DISPATCH_DECISIONS,
} from "../lib/mission-authority/persistent-dispatch-gateway.mjs";

const EXECUTION_ID = "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1";
const AUDIENCE = "provider.send.v1";
const DISPATCH_CLAIMED_AT = new Date(Date.now() - 30_000).toISOString();
const LEASE_EXPIRES_AT = new Date(Date.now() + 5 * 60_000).toISOString();

function validClaim(overrides = {}) {
  return {
    id: EXECUTION_ID,
    status: "RUNNING",
    workspace_id: "workspace-test",
    mission_id: "mission-test",
    action_id: "action-test",
    agent_id: "agent-test",
    approval_id: "approval-test",
    idempotency_key: "runtime-boundary-test-key-001",
    lease_expires_at: LEASE_EXPIRES_AT,
    authority_snapshot: {
      external_side_effects: true,
      requires_approval: true,
    },
    request: {
      destination: "https://provider.example.test/send",
      audience: AUDIENCE,
      summary: "Test-only approved request",
      payload: { message: "never sent outside this test" },
    },
    dispatch_claimed_at: DISPATCH_CLAIMED_AT,
    dispatch_claim_authority_hash: "a".repeat(64),
    dispatch_claim_request_hash: "b".repeat(64),
    dispatch_claim_budget_revision: 7,
    ...overrides,
  };
}

function createFakeClient({ firstDispatchClaimError = null, events = [] } = {}) {
  const calls = [];
  let dispatchClaimCount = 0;

  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      events.push("rpc:" + name);

      if (name === "claim_agent_execution_dispatch") {
        dispatchClaimCount += 1;
        if (dispatchClaimCount === 1 && firstDispatchClaimError) {
          return { data: null, error: firstDispatchClaimError };
        }
        if (dispatchClaimCount > 1) {
          // A persisted one-time claim must refuse a second dispatch attempt.
          return {
            data: null,
            error: { code: "42501", message: "EXECUTION_DISPATCH_ALREADY_CLAIMED" },
          };
        }
        return { data: validClaim(), error: null };
      }

      if (name === "complete_agent_execution") {
        return {
          data: { id: args.p_execution_id ?? EXECUTION_ID, status: args.p_status },
          error: null,
        };
      }

      if (name === "claim_agent_execution_reconciliation") {
        const reconciliationClaimedAt = new Date(Date.now() - 10_000).toISOString();
        return {
          data: validClaim({
            status: "UNKNOWN",
            reconciliation_claim_token: "test-only-reconciliation-claim-token",
            reconciliation_claimed_at: reconciliationClaimedAt,
            reconciliation_lease_expires_at: LEASE_EXPIRES_AT,
            evidence: { outcome: "UNKNOWN", reconciliation_required: true },
          }),
          error: null,
        };
      }

      if (name === "reconcile_agent_execution_outcome") {
        return {
          data: { id: args.p_execution_id ?? EXECUTION_ID, status: args.p_status },
          error: null,
        };
      }

      throw new Error("UNEXPECTED_RPC_" + name);
    },
  };
}

function createTestAdapter({ events, transportResult, lookupResult }) {
  let dispatchCalls = 0;
  let reconciliationCalls = 0;
  let fakeOutboundCalls = 0;

  return {
    adapter: {
      audience: AUDIENCE,
      async dispatch(claim) {
        dispatchCalls += 1;
        events.push("adapter:dispatch");
        assert.equal(claim.executionId, EXECUTION_ID);
        assert.equal(claim.audience, AUDIENCE);
        assert.equal(claim.destination, "https://provider.example.test/send");
        assert.ok(claim.authorityHash);
        assert.ok(claim.requestHash);

        // This is the only simulated outbound boundary. It is a local function,
        // not a network API, socket, SDK or real provider request.
        events.push("fake-transport");
        fakeOutboundCalls += 1;
        return transportResult;
      },
      async reconcile(claim) {
        reconciliationCalls += 1;
        events.push("adapter:reconcile");
        assert.equal(claim.executionId, EXECUTION_ID);
        assert.ok(claim.reconciliationClaimToken);
        return lookupResult;
      },
    },
    counts: () => ({ dispatchCalls, reconciliationCalls, fakeOutboundCalls }),
  };
}

async function invokeWorker({ operation, adapter, client, events }) {
  return runMissionActionWorker({
    audience: AUDIENCE,
    operation,
    executionId: EXECUTION_ID,
    resolveAdapter(requestedAudience) {
      events.push("worker:resolve-adapter");
      return requestedAudience === AUDIENCE ? adapter : null;
    },
    createClient() {
      events.push("worker:create-client");
      return client;
    },
    dispatch: ({ client: trustedClient, adapter: trustedAdapter, executionId }) =>
      dispatchThroughJitClaim({ client: trustedClient, adapter: trustedAdapter, executionId }),
    reconcile: ({ client: trustedClient, adapter: trustedAdapter, executionId }) =>
      reconcileThroughTrustedClaim({ client: trustedClient, adapter: trustedAdapter, executionId }),
  });
}

test("composed worker gate calls only the fake transport, and only after a valid persisted JIT claim", async () => {
  const events = [];
  const client = createFakeClient({ events });
  const testAdapter = createTestAdapter({
    events,
    transportResult: {
      state: "SUCCEEDED",
      receipt: { id: "test-provider-receipt-001", status: "accepted" },
    },
  });

  const result = await invokeWorker({
    operation: "dispatch",
    adapter: testAdapter.adapter,
    client,
    events,
  });

  assert.equal(result.kind, "completed");
  assert.equal(result.result.decision, PERSISTENT_DISPATCH_DECISIONS.DISPATCHED);
  assert.equal(result.result.persisted, true);
  assert.equal(testAdapter.counts().dispatchCalls, 1);
  assert.equal(testAdapter.counts().fakeOutboundCalls, 1);
  assert.deepEqual(events, [
    "worker:resolve-adapter",
    "worker:create-client",
    "rpc:claim_agent_execution_dispatch",
    "adapter:dispatch",
    "fake-transport",
    "rpc:complete_agent_execution",
  ]);
});

test("a JIT denial prevents adapter dispatch and leaves the fake outbound counter at zero", async () => {
  const events = [];
  const client = createFakeClient({
    events,
    firstDispatchClaimError: {
      code: "42501",
      message: "APPROVAL_REQUIRED_OR_SCOPE_CHANGED",
    },
  });
  const testAdapter = createTestAdapter({
    events,
    transportResult: { state: "SUCCEEDED", receipt: { id: "must-not-exist" } },
  });

  const result = await invokeWorker({
    operation: "dispatch",
    adapter: testAdapter.adapter,
    client,
    events,
  });

  assert.equal(result.kind, "completed");
  assert.notEqual(result.result.decision, PERSISTENT_DISPATCH_DECISIONS.DISPATCHED);
  assert.equal(testAdapter.counts().dispatchCalls, 0);
  assert.equal(testAdapter.counts().fakeOutboundCalls, 0);
  assert.deepEqual(events, [
    "worker:resolve-adapter",
    "worker:create-client",
    "rpc:claim_agent_execution_dispatch",
  ]);
});

test("UNKNOWN cannot trigger a second dispatch; reconciliation performs lookup only", async () => {
  const events = [];
  const client = createFakeClient({ events });
  const testAdapter = createTestAdapter({
    events,
    transportResult: { state: "UNKNOWN" },
    lookupResult: {
      state: "NOT_SENT",
      authoritative: true,
      method: "idempotency_key_lookup",
      providerState: "not_found",
      checkedAt: new Date().toISOString(),
    },
  });

  const first = await invokeWorker({
    operation: "dispatch",
    adapter: testAdapter.adapter,
    client,
    events,
  });
  assert.equal(first.result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
  assert.equal(first.result.status, "UNKNOWN");
  assert.equal(testAdapter.counts().fakeOutboundCalls, 1);

  const retry = await invokeWorker({
    operation: "dispatch",
    adapter: testAdapter.adapter,
    client,
    events,
  });
  assert.notEqual(retry.result.decision, PERSISTENT_DISPATCH_DECISIONS.DISPATCHED);
  assert.equal(testAdapter.counts().dispatchCalls, 1);
  assert.equal(testAdapter.counts().fakeOutboundCalls, 1);

  const reconciliation = await invokeWorker({
    operation: "reconcile",
    adapter: testAdapter.adapter,
    client,
    events,
  });
  assert.equal(reconciliation.result.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILED);
  assert.equal(reconciliation.result.status, "FAILED");
  assert.equal(testAdapter.counts().dispatchCalls, 1);
  assert.equal(testAdapter.counts().fakeOutboundCalls, 1);
  assert.equal(testAdapter.counts().reconciliationCalls, 1);
  assert.deepEqual(client.calls.map((call) => call.name), [
    "claim_agent_execution_dispatch",
    "complete_agent_execution",
    "claim_agent_execution_dispatch",
    "claim_agent_execution_reconciliation",
    "reconcile_agent_execution_outcome",
  ]);

  const firstOutbound = events.indexOf("fake-transport");
  const firstClaim = events.indexOf("rpc:claim_agent_execution_dispatch");
  const reconciliationClaim = events.indexOf("rpc:claim_agent_execution_reconciliation");
  const lookup = events.indexOf("adapter:reconcile");
  const persistedReconciliation = events.indexOf("rpc:reconcile_agent_execution_outcome");
  assert.ok(firstClaim >= 0 && firstClaim < firstOutbound);
  assert.ok(reconciliationClaim >= 0 && reconciliationClaim < lookup);
  assert.ok(lookup < persistedReconciliation);
  assert.equal(events.filter((event) => event === "fake-transport").length, 1);
});

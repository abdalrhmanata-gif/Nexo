import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTEMPT_STATES,
  DECISIONS,
  ControlledServerAdapter,
  FakeExternalSystem,
  InMemoryAuthorityStore,
  hashInput,
} from "../lib/mission-authority/controlled-adapter.mjs";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

function authority(overrides = {}) {
  return {
    organizationId: "org-a",
    principalId: "user-a",
    missionId: "mission-a",
    missionVersion: 3,
    actionVersion: 7,
    authorityRevision: 9,
    policyVersion: 4,
    authorityStatus: "ACTIVE",
    status: "ACTIVE",
    notBefore: "2026-10-01T11:00:00.000Z",
    expiresAt: "2026-10-01T13:00:00.000Z",
    leaseId: "lease-a",
    leaseActive: true,
    leaseExpiresAt: "2026-10-01T12:30:00.000Z",
    revoked: false,
    audience: "fake.external.v1",
    destination: "https://fake.external.test/action",
    agentId: "agent-a",
    allowedActions: ["send"],
    deniedActions: [],
    requireApproval: false,
    approval: null,
    maxActions: 1,
    maxSpend: 10,
    spentActions: 0,
    spentAmount: 0,
    ...overrides,
  };
}

function request(overrides = {}, input = { message: "hello", count: 1 }) {
  return {
    organizationId: "org-a",
    principalId: "user-a",
    missionId: "mission-a",
    missionVersion: 3,
    actionId: "send",
    actionVersion: 7,
    authorityRevision: 9,
    leaseId: "lease-a",
    policyVersion: 4,
    audience: "fake.external.v1",
    destination: "https://fake.external.test/action",
    agentId: "agent-a",
    idempotencyKey: "idem-1",
    input,
    inputHash: hashInput(input),
    amount: 2,
    ...overrides,
  };
}

function setup({ authorityOverrides, outcome, clock = () => NOW } = {}) {
  const store = new InMemoryAuthorityStore();
  store.seedAuthority(authority(authorityOverrides));
  const external = new FakeExternalSystem();
  if (outcome) external.setOutcome("idem-1", outcome);
  const adapter = new ControlledServerAdapter({ authorityStore: store, externalSystem: external, clock });
  return { store, external, adapter };
}

test("allows one exact bound execution and records a correlated receipt", async () => {
  const { adapter, external, store } = setup();
  const result = await adapter.execute(request());
  assert.equal(result.decision, DECISIONS.ALLOW);
  assert.equal(result.state, ATTEMPT_STATES.SUCCEEDED);
  assert.equal(external.calls().length, 1);
  const attempt = store.getAttempt(result.attemptId);
  assert.equal(attempt.inputHash, hashInput({ message: "hello", count: 1 }));
  assert.equal(attempt.idempotencyKey, "idem-1");
  assert.equal(attempt.destination, "https://fake.external.test/action");
  assert.ok(attempt.receipt.externalId);
});

test("fails closed for cross-tenant, stale, revoked, expired, lease-mismatch and destination-mismatch requests", async () => {
  for (const [name, overrides] of Object.entries({
    crossTenant: { organizationId: "org-b", principalId: "user-b" },
    staleMission: { missionVersion: 99 },
    staleAction: { actionVersion: 99 },
    staleAuthority: { authorityRevision: 99 },
    revoked: { revoked: true },
    expired: { expiresAt: "2026-09-30T23:59:00.000Z" },
    leaseExpired: { leaseExpiresAt: "2026-09-30T11:59:59.000Z" },
    leaseInactive: { leaseActive: false },
    notYetValid: { notBefore: "2026-10-01T12:01:00.000Z" },
    invalidExpiry: { expiresAt: "invalid" },
    leaseMismatch: { leaseId: "lease-b" },
    destination: { destination: "https://evil.example" },
  })) {
    const { adapter, external } = setup();
    const result = await adapter.execute(request(overrides));
    assert.equal(result.decision, DECISIONS.DENY, name);
    assert.equal(external.calls().length, 0, name);
  }

  for (const [name, overrides, reasonCode] of [
    ["storedRevoked", { revoked: true }, "AUTHORITY_REVOKED"],
    ["storedExpired", { expiresAt: new Date(NOW).toISOString() }, "AUTHORITY_EXPIRED"],
    ["storedLeaseExpired", { leaseExpiresAt: new Date(NOW).toISOString() }, "LEASE_EXPIRED"],
    ["storedLeaseInactive", { leaseActive: false }, "LEASE_INACTIVE"],
    ["storedAuthorityInactive", { authorityStatus: "REVOKED" }, "AUTHORITY_NOT_ACTIVE"],
    ["storedInvalidExpiry", { expiresAt: "invalid" }, "INVALID_VALIDITY_WINDOW"],
    ["storedMissingExpiry", { expiresAt: undefined }, "INVALID_VALIDITY_WINDOW"],
    ["storedInvalidLease", { leaseExpiresAt: null }, "INVALID_VALIDITY_WINDOW"],
  ]) {
    const { adapter, external, store } = setup({ authorityOverrides: overrides });
    const result = await adapter.execute(request({
      revoked: false,
      leaseActive: true,
      expiresAt: "2027-01-01T00:00:00.000Z",
      leaseExpiresAt: "2027-01-01T00:00:00.000Z",
    }));
    assert.equal(result.decision, DECISIONS.DENY, name);
    assert.equal(result.reasonCode, reasonCode, name);
    assert.equal(external.calls().length, 0, name);
    assert.equal(store.getJournal().some((entry) => entry.decision === DECISIONS.ALLOW), false, name);
  }

  const { adapter, external } = setup();
  const denied = await adapter.execute(request({ revoked: true }));
  assert.equal(denied.reasonCode, "AUTHORITY_REVOKED");
  assert.equal(external.calls().length, 0);
  const valid = await adapter.execute(request());
  assert.equal(valid.decision, DECISIONS.ALLOW); // Denial must not reserve budget or idempotency.
  assert.equal(external.calls().length, 1);
  const revokedReplay = await adapter.execute(request({ revoked: true }));
  assert.equal(revokedReplay.decision, DECISIONS.DENY);
  assert.equal(revokedReplay.reasonCode, "AUTHORITY_REVOKED");
  assert.equal(external.calls().length, 1);
});

test("requires exact approval binding instead of dispatching when approval is required", async () => {
  const input = { message: "hello", count: 1 };
  const validApproval = {
    active: true,
    organizationId: "org-a",
    principalId: "user-a",
    missionId: "mission-a",
    missionVersion: 3,
    actionId: "send",
    actionVersion: 7,
    inputHash: hashInput(input),
    destination: "https://fake.external.test/action",
    authorityRevision: 9,
    expiresAt: "2026-10-01T12:30:00.000Z",
  };

  for (const approval of [
    null,
    ...Object.entries({
      active: false,
      organizationId: "org-b",
      principalId: "user-b",
      missionId: "mission-b",
      missionVersion: 99,
      actionId: "other",
      actionVersion: 99,
      inputHash: "wrong",
      destination: "https://evil.example",
      authorityRevision: 99,
      expiresAt: new Date(NOW).toISOString(),
    }).map(([field, value]) => ({ ...validApproval, [field]: value })),
  ]) {
    const denied = setup({ authorityOverrides: { requireApproval: true, approval } });
    const deniedResult = await denied.adapter.execute(request({}, input));
    assert.equal(deniedResult.decision, DECISIONS.REQUIRE_APPROVAL);
    assert.equal(denied.external.calls().length, 0);
  }

  const allowed = setup({ authorityOverrides: { requireApproval: true, approval: validApproval } });
  const allowedResult = await allowed.adapter.execute(request({}, input));
  assert.equal(allowedResult.decision, DECISIONS.ALLOW);
  assert.equal(allowed.external.calls().length, 1);
});

test("rejects an altered input hash before any external call", async () => {
  const { adapter, external } = setup();
  const result = await adapter.execute(request({ inputHash: "bad-hash" }));
  assert.equal(result.decision, DECISIONS.DENY);
  assert.equal(result.reasonCode, "INPUT_HASH_MISMATCH");
  assert.equal(external.calls().length, 0);
});

test("duplicate idempotency key is rejected before budget is considered", async () => {
  const { adapter, external } = setup();
  await adapter.execute(request());
  const duplicate = await adapter.execute(request());
  assert.equal(duplicate.decision, DECISIONS.DENY);
  assert.equal(duplicate.reasonCode, "IDEMPOTENCY_REPLAY");
  assert.equal(external.calls().length, 1);
});

test("concurrent requests with the same idempotency key dispatch exactly once", async () => {
  const { adapter, external } = setup();
  const results = await Promise.all([adapter.execute(request()), adapter.execute(request())]);

  assert.equal(results.filter((result) => result.decision === DECISIONS.ALLOW).length, 1);
  const rejected = results.find((result) => result.decision === DECISIONS.DENY);
  assert.equal(rejected?.reasonCode, "IDEMPOTENCY_REPLAY");
  assert.equal(external.calls().length, 1);
});

test("idempotency key cannot be rebound after authoritative revision changes", async () => {
  const { adapter, external, store } = setup();
  await adapter.execute(request());
  store.seedAuthority(authority({ authorityRevision: 10, missionVersion: 4 }));
  const rebound = await adapter.execute(request({ authorityRevision: 10, missionVersion: 4 }));
  assert.equal(rebound.decision, DECISIONS.DENY);
  assert.equal(rebound.reasonCode, "IDEMPOTENCY_BINDING_MISMATCH");
  assert.equal(external.calls().length, 1);
});

test("one remaining action budget cannot authorize two concurrent attempts", async () => {
  const { store, external } = setup();
  const requestB = request({ idempotencyKey: "idem-2" });
  const [a, b] = await Promise.all([adapterExecute(store, external, request()), adapterExecute(store, external, requestB)]);
  const decisions = [a.decision, b.decision];
  assert.equal(decisions.filter((value) => value === DECISIONS.ALLOW).length, 1);
  assert.equal(decisions.filter((value) => value === DECISIONS.DENY).length, 1);
  assert.equal([a, b].find((result) => result.decision === DECISIONS.DENY).reasonCode, "ACTION_BUDGET_EXHAUSTED");
  assert.equal(external.calls().length, 1);
});

async function adapterExecute(store, external, req) {
  return new ControlledServerAdapter({ authorityStore: store, externalSystem: external, clock: () => NOW }).execute(req);
}

test("UNKNOWN never retries blindly and reconciliation resolves a sent request", async () => {
  const { adapter, external } = setup({ outcome: { kind: "UNKNOWN_AFTER_SEND" } });
  const first = await adapter.execute(request());
  assert.equal(first.decision, DECISIONS.RECONCILE_REQUIRED);
  assert.equal(external.calls().length, 1);

  const blockedRetry = await adapter.execute(request());
  assert.equal(blockedRetry.decision, DECISIONS.RECONCILE_REQUIRED);
  assert.equal(blockedRetry.reasonCode, "UNKNOWN_REQUIRES_RECONCILIATION");
  assert.equal(external.calls().length, 1);

  const reconciled = await adapter.reconcile(first.attemptId);
  assert.equal(reconciled.state, ATTEMPT_STATES.SUCCEEDED);
  assert.ok(reconciled.receipt.externalId);
});

test("UNKNOWN with no external record becomes explicitly retryable only after reconciliation", async () => {
  const { adapter, external } = setup({ outcome: { kind: "UNKNOWN_BEFORE_SEND" } });
  const first = await adapter.execute(request());
  assert.equal(first.decision, DECISIONS.RECONCILE_REQUIRED);
  assert.equal(external.calls().length, 1);

  const blockedRetry = await adapter.execute(request());
  assert.equal(blockedRetry.decision, DECISIONS.RECONCILE_REQUIRED);
  assert.equal(external.calls().length, 1);

  const reconciled = await adapter.reconcile(first.attemptId);
  assert.equal(reconciled.state, ATTEMPT_STATES.RECONCILED_NOT_SENT);

  const retry = await adapter.execute(request({ idempotencyKey: "idem-2" }));
  assert.equal(retry.decision, DECISIONS.DENY); // budget remains consumed until a durable refund policy is designed.
  assert.equal(retry.reasonCode, "ACTION_BUDGET_EXHAUSTED");
  assert.equal(external.calls().length, 1);
});

test("decision journal contains no payload, secret, or credential fields", async () => {
  const { adapter, store } = setup();
  await adapter.execute(request());
  const journal = store.getJournal();
  assert.ok(journal.some((entry) => entry.type === "AUTHORIZATION"));
  for (const entry of journal) {
    assert.equal("input" in entry, false);
    assert.equal("authorizationToken" in entry, false);
    assert.equal("password" in entry, false);
    assert.equal("secret" in entry, false);
  }
});


test("unexpected transport failure is fail-closed as UNKNOWN", async () => {
  const { adapter, external } = setup({ outcome: { kind: "TRANSPORT_ERROR" } });
  const result = await adapter.execute(request());
  assert.equal(result.decision, DECISIONS.RECONCILE_REQUIRED);
  assert.equal(result.reasonCode, "UNKNOWN_REQUIRES_RECONCILIATION");
  assert.equal(external.calls().length, 1);
  const retry = await adapter.execute(request());
  assert.equal(retry.decision, DECISIONS.RECONCILE_REQUIRED);
  assert.equal(external.calls().length, 1);
});

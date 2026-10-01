import { createHash, randomUUID } from "node:crypto";

export const DECISIONS = Object.freeze({
  ALLOW: "ALLOW",
  DENY: "DENY",
  REQUIRE_APPROVAL: "REQUIRE_APPROVAL",
  RECONCILE_REQUIRED: "RECONCILE_REQUIRED",
  RETRYABLE_NOT_SENT: "RETRYABLE_NOT_SENT",
});

export const ATTEMPT_STATES = Object.freeze({
  AUTHORIZED: "AUTHORIZED",
  ACCEPTED: "ACCEPTED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
  RECONCILED_NOT_SENT: "RECONCILED_NOT_SENT",
});

export class AuthorityViolation extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "AuthorityViolation";
    this.code = code;
  }
}

export class UnknownExternalResult extends Error {
  constructor(message = "External outcome is unknown.") {
    super(message);
    this.name = "UnknownExternalResult";
    this.code = "UNKNOWN_EXTERNAL_RESULT";
  }
}

export class DefiniteExternalFailure extends Error {
  constructor(message = "External execution failed.") {
    super(message);
    this.name = "DefiniteExternalFailure";
    this.code = "DEFINITE_EXTERNAL_FAILURE";
  }
}

function assertNonEmpty(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AuthorityViolation(`MISSING_${name.toUpperCase()}`);
  }
  return value.trim();
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

export function hashInput(input) {
  return createHash("sha256").update(canonicalize(input)).digest("hex");
}

function nowMs(clock) {
  return typeof clock === "function" ? clock() : Date.now();
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class Mutex {
  #tail = Promise.resolve();

  async run(task) {
    const previous = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }
}

/**
 * Disposable in-memory authoritative store.
 *
 * This is intentionally NOT a production persistence layer. It exists to make
 * the server-side decision seam executable and testable before database/RPC
 * changes are justified.
 */
export class InMemoryAuthorityStore {
  #missions = new Map();
  #attempts = new Map();
  #journal = [];
  #mutex = new Mutex();

  seedAuthority(state) {
    const missionId = assertNonEmpty(state.missionId, "missionId");
    this.#missions.set(missionId, clone({
      ...state,
      status: state.status ?? "ACTIVE",
      spentActions: state.spentActions ?? 0,
      spentAmount: state.spentAmount ?? 0,
    }));
  }

  getAttempt(attemptId) {
    return clone(this.#attempts.get(attemptId) ?? null);
  }

  getJournal() {
    return clone(this.#journal);
  }

  async authorize(request, clock = Date.now) {
    return this.#mutex.run(async () => {
      const now = nowMs(clock);
      const mission = this.#missions.get(request.missionId);
      if (!mission) return this.#deny("MISSION_NOT_FOUND");

      const suppliedHash = hashInput(request.input);
      if (request.inputHash !== suppliedHash) return this.#deny("INPUT_HASH_MISMATCH");

      const required = [
        ["organizationId", request.organizationId],
        ["principalId", request.principalId],
        ["missionId", request.missionId],
        ["actionId", request.actionId],
        ["authorityRevision", request.authorityRevision],
        ["audience", request.audience],
        ["destination", request.destination],
        ["agentId", request.agentId],
        ["idempotencyKey", request.idempotencyKey],
      ];
      for (const [name, value] of required) {
        try { assertNonEmpty(value, name); }
        catch (error) { return this.#deny(error.code); }
      }

      if (mission.organizationId !== request.organizationId ||
          mission.principalId !== request.principalId ||
          mission.missionVersion !== request.missionVersion ||
          mission.actionVersion !== request.actionVersion ||
          mission.authorityRevision !== request.authorityRevision ||
          mission.leaseId !== request.leaseId ||
          mission.policyVersion !== request.policyVersion ||
          mission.audience !== request.audience ||
          mission.destination !== request.destination ||
          mission.agentId !== request.agentId) {
        return this.#deny("BINDING_MISMATCH");
      }

      if (mission.status !== "ACTIVE") return this.#deny("MISSION_NOT_ACTIVE");
      if (now < new Date(mission.notBefore).getTime()) return this.#deny("NOT_BEFORE");
      if (now >= new Date(mission.expiresAt).getTime()) return this.#deny("AUTHORITY_EXPIRED");
      if (now >= new Date(mission.leaseExpiresAt).getTime()) return this.#deny("LEASE_EXPIRED");
      if (mission.revoked) return this.#deny("AUTHORITY_REVOKED");
      if (!mission.leaseActive) return this.#deny("LEASE_INACTIVE");
      if (mission.allowedActions && !mission.allowedActions.includes(request.actionId)) {
        return this.#deny("ACTION_NOT_ALLOWED");
      }
      if (mission.deniedActions?.includes(request.actionId)) return this.#deny("ACTION_DENIED");

      if (mission.requireApproval) {
        const approval = mission.approval;
        const exactApproval = approval
          && approval.active === true
          && approval.organizationId === request.organizationId
          && approval.principalId === request.principalId
          && approval.missionId === request.missionId
          && approval.missionVersion === request.missionVersion
          && approval.actionId === request.actionId
          && approval.actionVersion === request.actionVersion
          && approval.inputHash === suppliedHash
          && approval.destination === request.destination
          && approval.authorityRevision === request.authorityRevision
          && approval.expiresAt
          && now < new Date(approval.expiresAt).getTime();
        if (!exactApproval) {
          this.#journal.push({ type: "AUTHORIZATION", decision: DECISIONS.REQUIRE_APPROVAL, reason: "APPROVAL_REQUIRED", at: iso(now) });
          return { decision: DECISIONS.REQUIRE_APPROVAL, reasonCode: "APPROVAL_REQUIRED" };
        }
      }

      const priorAttempt = [...this.#attempts.values()].find(
        (attempt) => attempt.idempotencyKey === request.idempotencyKey,
      );
      if (priorAttempt) {
        const sameBinding = priorAttempt.organizationId === request.organizationId
          && priorAttempt.principalId === request.principalId
          && priorAttempt.missionId === request.missionId
          && priorAttempt.actionId === request.actionId
          && priorAttempt.actionVersion === request.actionVersion
          && priorAttempt.inputHash === suppliedHash
          && priorAttempt.authorityRevision === request.authorityRevision
          && priorAttempt.leaseId === request.leaseId
          && priorAttempt.audience === request.audience
          && priorAttempt.destination === request.destination;
        if (!sameBinding) return this.#deny("IDEMPOTENCY_BINDING_MISMATCH");
        if (priorAttempt.state === ATTEMPT_STATES.UNKNOWN) {
          return { decision: DECISIONS.RECONCILE_REQUIRED, reasonCode: "UNKNOWN_REQUIRES_RECONCILIATION" };
        }
        return this.#deny("IDEMPOTENCY_REPLAY");
      }

      if (mission.maxActions !== null && mission.maxActions !== undefined &&
          mission.spentActions >= mission.maxActions) {
        return this.#deny("ACTION_BUDGET_EXHAUSTED");
      }

      if (mission.maxSpend !== null && mission.maxSpend !== undefined &&
          mission.spentAmount + (request.amount ?? 0) > mission.maxSpend) {
        return this.#deny("SPEND_BUDGET_EXHAUSTED");
      }

      mission.spentActions += 1;
      mission.spentAmount += request.amount ?? 0;

      const attempt = {
        attemptId: randomUUID(),
        organizationId: request.organizationId,
        principalId: request.principalId,
        missionId: request.missionId,
        actionId: request.actionId,
        missionVersion: request.missionVersion,
        actionVersion: request.actionVersion,
        inputHash: suppliedHash,
        authorityRevision: request.authorityRevision,
        leaseId: request.leaseId,
        policyVersion: request.policyVersion,
        audience: request.audience,
        destination: request.destination,
        agentId: request.agentId,
        idempotencyKey: request.idempotencyKey,
        amount: request.amount ?? 0,
        state: ATTEMPT_STATES.AUTHORIZED,
        createdAt: iso(now),
        updatedAt: iso(now),
        receipt: null,
        reasonCode: "ALLOW",
      };
      this.#attempts.set(attempt.attemptId, attempt);
      this.#journal.push({ type: "AUTHORIZATION", decision: DECISIONS.ALLOW, attemptId: attempt.attemptId, at: iso(now) });
      return { decision: DECISIONS.ALLOW, reasonCode: "ALLOW", attemptId: attempt.attemptId };
    });
  }

  async markResult(attemptId, result, clock = Date.now) {
    return this.#mutex.run(async () => {
      const attempt = this.#attempts.get(attemptId);
      if (!attempt) throw new AuthorityViolation("ATTEMPT_NOT_FOUND");
      const at = iso(nowMs(clock));
      attempt.state = result.state;
      attempt.receipt = clone(result.receipt ?? null);
      attempt.updatedAt = at;
      this.#journal.push({ type: "ATTEMPT_RESULT", attemptId, state: result.state, at });
      return clone(attempt);
    });
  }

  async reconcile(attemptId, externalRecord, clock = Date.now) {
    return this.#mutex.run(async () => {
      const attempt = this.#attempts.get(attemptId);
      if (!attempt) throw new AuthorityViolation("ATTEMPT_NOT_FOUND");
      if (attempt.state !== ATTEMPT_STATES.UNKNOWN) return clone(attempt);

      const at = iso(nowMs(clock));
      if (!externalRecord) {
        attempt.state = ATTEMPT_STATES.RECONCILED_NOT_SENT;
        attempt.updatedAt = at;
        this.#journal.push({ type: "RECONCILIATION", attemptId, result: DECISIONS.RETRYABLE_NOT_SENT, at });
        return clone(attempt);
      }

      attempt.state = externalRecord.state;
      attempt.receipt = clone(externalRecord.receipt ?? null);
      attempt.updatedAt = at;
      this.#journal.push({ type: "RECONCILIATION", attemptId, result: externalRecord.state, at });
      return clone(attempt);
    });
  }

  #deny(reasonCode) {
    this.#journal.push({ type: "AUTHORIZATION", decision: DECISIONS.DENY, reason: reasonCode, at: new Date().toISOString() });
    return { decision: DECISIONS.DENY, reasonCode };
  }
}

export class FakeExternalSystem {
  #calls = [];
  #records = new Map();
  #script = new Map();

  setOutcome(idempotencyKey, outcome) {
    this.#script.set(idempotencyKey, outcome);
  }

  calls() {
    return clone(this.#calls);
  }

  lookup(idempotencyKey) {
    return clone(this.#records.get(idempotencyKey) ?? null);
  }

  async dispatch({ idempotencyKey, payload }) {
    this.#calls.push({ idempotencyKey, payload: clone(payload) });
    if (this.#records.has(idempotencyKey)) {
      return clone(this.#records.get(idempotencyKey));
    }

    const outcome = this.#script.get(idempotencyKey) ?? { state: ATTEMPT_STATES.SUCCEEDED, receipt: { externalId: randomUUID() } };
    if (outcome.kind === "UNKNOWN_AFTER_SEND") {
      const record = { state: ATTEMPT_STATES.SUCCEEDED, receipt: { externalId: randomUUID() } };
      this.#records.set(idempotencyKey, record);
      throw new UnknownExternalResult();
    }
    if (outcome.kind === "UNKNOWN_BEFORE_SEND") {
      throw new UnknownExternalResult("Dispatch result cannot be established.");
    }
    if (outcome.kind === "TRANSPORT_ERROR") {
      throw new Error("transport interrupted");
    }
    if (outcome.kind === "FAILED") {
      throw new DefiniteExternalFailure(outcome.message ?? "External execution failed.");
    }

    const record = { state: outcome.state ?? ATTEMPT_STATES.SUCCEEDED, receipt: clone(outcome.receipt ?? { externalId: randomUUID() }) };
    this.#records.set(idempotencyKey, record);
    return clone(record);
  }
}

export class ControlledServerAdapter {
  constructor({ authorityStore, externalSystem, clock = Date.now }) {
    this.authorityStore = authorityStore;
    this.externalSystem = externalSystem;
    this.clock = clock;
  }

  async execute(request) {
    const decision = await this.authorityStore.authorize(request, this.clock);
    if (decision.decision !== DECISIONS.ALLOW) return decision;

    try {
      const result = await this.externalSystem.dispatch({
        idempotencyKey: request.idempotencyKey,
        payload: {
          missionId: request.missionId,
          actionId: request.actionId,
          destination: request.destination,
          inputHash: decision.attemptId ? hashInput(request.input) : request.inputHash,
        },
      });
      const attempt = await this.authorityStore.markResult(decision.attemptId, result, this.clock);
      return { decision: DECISIONS.ALLOW, attemptId: decision.attemptId, state: attempt.state, receipt: attempt.receipt };
    } catch (error) {
      if (error instanceof UnknownExternalResult) {
        const attempt = await this.authorityStore.markResult(decision.attemptId, { state: ATTEMPT_STATES.UNKNOWN }, this.clock);
        return { decision: DECISIONS.RECONCILE_REQUIRED, attemptId: attempt.attemptId, reasonCode: "UNKNOWN_REQUIRES_RECONCILIATION" };
      }
      if (error instanceof DefiniteExternalFailure) {
        const attempt = await this.authorityStore.markResult(decision.attemptId, { state: ATTEMPT_STATES.FAILED }, this.clock);
        return { decision: DECISIONS.DENY, attemptId: attempt.attemptId, reasonCode: "EXTERNAL_FAILED", state: attempt.state };
      }
      const attempt = await this.authorityStore.markResult(
        decision.attemptId,
        { state: ATTEMPT_STATES.UNKNOWN },
        this.clock,
      );
      return {
        decision: DECISIONS.RECONCILE_REQUIRED,
        attemptId: attempt.attemptId,
        reasonCode: "UNKNOWN_REQUIRES_RECONCILIATION",
      };
    }
  }

  async reconcile(attemptId) {
    const attempt = this.authorityStore.getAttempt(attemptId);
    if (!attempt) throw new AuthorityViolation("ATTEMPT_NOT_FOUND");
    const externalRecord = this.externalSystem.lookup(attempt.idempotencyKey);
    return this.authorityStore.reconcile(attemptId, externalRecord, this.clock);
  }
}

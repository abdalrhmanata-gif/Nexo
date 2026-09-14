# NEXO v1.0 — Mission Runtime Contract

## Purpose
NEXO v1.0 makes a Mission a durable autonomous process rather than a chat turn. The runtime can stop, wait, resume, replan, hand off between agents, and verify an outcome without losing authority boundaries.

## Runtime state machine
DRAFT → PLANNING → READY → RUNNING ↔ WAITING / NEEDS_USER → VERIFYING → COMPLETED

Side states: PAUSED, BLOCKED, FAILED, CANCELLED.

Every transition is server-authoritative and version-fenced. An invalid transition or stale mission version fails closed.

## Runtime invariants
1. Runtime state never grants authority.
2. Replanning can change strategy, never delegation, budget, policy, or success criteria.
3. Waiting is durable; app closure does not terminate the mission.
4. Resume requires the current mission version and valid delegation.
5. Verification is mandatory before COMPLETED.
6. Unknown external outcomes remain UNKNOWN until reconciled.
7. Cross-agent continuation rebinds execution identity; it does not transfer or expand authority.
8. Runtime events are append-only audit facts; they are not a permission source.
9. Every state mutation is optimistic-lock/version fenced.
10. A mission checkpoint binds mission version, authority passport, delegation, action revision, execution lease, remaining budgets, and a state digest.

## Checkpoint
A durable checkpoint is the minimum portable state needed to continue safely. A consumer must reject a checkpoint if its mission, tenant, authority passport, delegation, revision, lease, or version does not match authoritative state.

## Replanning
The intelligence layer may propose a new plan after WAITING, NEEDS_USER, FAILED, or provider change. NEXO validates the resulting plan against the immutable Mission Contract and Authority Passport. A plan that expands authority is rejected and requires a new delegation/revision.

## Provider independence
Provider/model changes are runtime implementation choices. They cannot change the mission's authority, success criteria, tenant, budget, or audit identity.

## Completion rule
COMPLETED is a business state, not a model claim. The runtime must pass through VERIFYING and attach a verified result before outcome commit.

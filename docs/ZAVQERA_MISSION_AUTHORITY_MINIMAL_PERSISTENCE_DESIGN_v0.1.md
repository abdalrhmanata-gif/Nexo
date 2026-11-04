# ZAVQERA Mission Authority — Minimal Persistence Design Proposal v0.1 (2026-10-01)

Status: design only. No SQL migration, RPC or hosted schema change.

## Evidence now available

The isolated Controlled Adapter tests are part of the Web build gate. Commit 5934c5b266a5137db9513502fe610f606bf26cfd received successful Vercel build statuses, and the build script at that commit executes npm test before next build. This is execution evidence for the current Web test suite, but not PostgreSQL concurrency evidence.

The Development catalog reconciliation shows that the existing mission tables do not persist authority revision, lease, exact approval binding, execution attempt/idempotency state, or atomic budget reservation.

## Candidate persistent primitives

### 1. Authority grant / revision state
One current authoritative record per mission revision should carry:
- tenant/principal/mission identity;
- authority revision and mission version;
- status, not-before and expiry;
- revocation state/reference;
- agent binding;
- policy version;
- allowed/denied action scope;
- allowed destinations/audience;
- action and spend limits plus consumed counters;
- current execution lease identity and expiry, only if the lease is intentionally mission-scoped.

### 2. Exact approval state
Approval must be independently durable and bind:
- approver/principal;
- mission + authority revision;
- action + action version;
- input hash;
- destination/audience;
- expiry and active/revoked state.

A generic approval flag is insufficient.

### 3. Execution attempt state
Every side-effecting dispatch needs:
- server-generated attempt id;
- tenant/mission/action/version;
- authority revision + lease id;
- input hash;
- audience/destination;
- idempotency key with a database-enforced uniqueness rule;
- decision and stable reason code;
- NOT_SENT / ACCEPTED / SUCCEEDED / FAILED / UNKNOWN state;
- receipt/reference;
- reconciliation state/timestamp;
- created/updated timestamps.

## Atomic authorization/dispatch fence

The production transaction must, at minimum:

1. Lock/read the authoritative mission authority record.
2. Re-check tenant, mission/action/version, revocation, expiry, lease, policy, approval, destination and input hash from authoritative state.
3. Reject replay by the durable idempotency uniqueness rule.
4. Atomically reserve the action/spend budget with a conditional update.
5. Insert the execution attempt/ALLOW correlation in the same transaction.
6. Commit the transaction before the external side effect.
7. Dispatch only through the controlled worker adapter.
8. Persist the external result or UNKNOWN state.
9. Reconcile UNKNOWN before any retry.

A database constraint or transaction failure must fail closed.

## Concurrency proof required before migration

Two independent PostgreSQL sessions must race the same remaining budget and the same/different idempotency keys. The evidence must show:
- at most one ALLOW for one remaining action budget;
- no duplicate attempt for one idempotency key;
- changed authority revision/action/input/destination cannot reuse an existing key;
- revocation/expiry wins even when a stale worker races dispatch.

This is a separate proof from the Web unit tests.

## Compatibility

Existing mission/action/history tables remain authoritative for their current responsibilities. New security state should reference them rather than overload their existing columns. Existing append-only history and auth.users -> private.handle_new_user_profile binding must remain intact.

No production schema object is proposed by this document.

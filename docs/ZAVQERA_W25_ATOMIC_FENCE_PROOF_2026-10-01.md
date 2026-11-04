# ZAVQERA W25 — Isolated PostgreSQL Atomic Fence Proof

**Status:** Test-only proof harness. No production schema, migration, RPC, Supabase Main, or hosted Development change.

## Purpose

Prove the two persistence invariants required before proposing a production Mission Authority persistence design:

1. Two independent PostgreSQL sessions competing for one remaining action budget can authorize at most one attempt.
2. Two independent sessions using the same idempotency key can create at most one execution attempt.

## Test database

The GitHub Actions workflow starts a disposable PostgreSQL 17 service named `zavqera_w25`. The schema is created inside the test database only and is discarded with the runner.

The test-only tables are:

- `authority_state(mission_id, remaining_actions)`
- `execution_attempts(attempt_id, mission_id, idempotency_key UNIQUE)`

These names are deliberately not production proposals.

## Atomic fence exercised

Each competing session:

1. begins a transaction;
2. locks the authoritative mission row with `SELECT ... FOR UPDATE`;
3. checks remaining budget;
4. decrements the budget;
5. inserts the execution attempt;
6. commits.

For the budget race, the fixture starts with one remaining action and two different idempotency keys. Exactly one transaction may commit.

For the idempotency race, the fixture starts with two remaining actions and two independent transactions use the same idempotency key. Exactly one transaction may commit; the unique constraint prevents the duplicate.

## Acceptance

The CI job must print:

- `W25_ATOMIC_FENCE=PASS`
- `budget_concurrency=PASS`
- `idempotency_uniqueness=PASS`

A passing test proves only these isolated PostgreSQL invariants. It does not establish the full production Mission Authority schema, RLS model, worker protocol, or external-provider reconciliation semantics.

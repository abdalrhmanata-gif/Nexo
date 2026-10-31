# ZAVQERA W25 — Isolated PostgreSQL Atomic Fence Proof

**Status:** Test-only concurrency proof. It does not certify production Mission Authority persistence, authorization, RLS, worker execution, or provider reconciliation.

## Purpose

Prove two narrowly defined PostgreSQL invariants using two independent psql sessions and real row-lock/unique-constraint behavior:

1. Two transactions competing for one remaining action budget cannot both reserve an attempt.
2. Two transactions using the same idempotency key cannot both create an attempt; the losing transaction must roll back its budget decrement.

## Isolation and destructive-operation guard

The GitHub Actions workflow starts an ephemeral PostgreSQL 17 service named zavqera_w25. Before creating any objects, the script requires the explicit ZAVQERA_W25_DISPOSABLE=1 sentinel, parses DATABASE_URL without printing it, and refuses any endpoint except postgres@127.0.0.1:5432/zavqera_w25 (or localhost). It also checks the connected database, user and server major version.

Each run creates a uniquely named schema and places only its fixture tables there. Cleanup drops only that generated schema. The script no longer drops generic table names or relies on the database's default schema. The test runner has no hosted Supabase credentials and no provider credentials.

## Test-only fixture

- authority_state(mission_id, remaining_actions)
- execution_attempts(attempt_id, mission_id, idempotency_key UNIQUE)

These names are deliberately not production schema proposals.

## Atomic behavior exercised

Each transaction locks one mission fixture row with SELECT ... FOR UPDATE, decrements remaining budget conditionally, then inserts an attempt in the same transaction.

For the budget race, one unit of budget is shared by two different idempotency keys. Exactly one transaction must commit; the other must fail at the reservation guard. The final state must show zero remaining actions and exactly one attempt.

For the idempotency race, two independent transactions start with two budget units but use the same idempotency key. Exactly one transaction must commit; the other must fail on the unique constraint. Its earlier budget decrement must roll back, leaving one budget unit, one attempt and one distinct key.

## Automated invocation and acceptance

The workflow runs on relevant pull-request changes, the existing deployment branch, and manual dispatch. It must print:

- postgres_major=17
- schema_isolation=PASS
- external_database_target=REFUSED
- schema_cleanup=PASS
- W25_ATOMIC_FENCE=PASS
- budget_concurrency=PASS
- idempotency_uniqueness=PASS

A passing run proves only these isolated database primitives under this fixture. It does **not** prove production schema compatibility, multi-tenant authorization, RLS/GRANT behavior, revocation/lease TOCTOU fencing, cross-process worker coordination, crash recovery, provider settlement or billing. Those remain separate release gates.

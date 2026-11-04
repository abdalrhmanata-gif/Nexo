# ZAVQERA Controlled Adapter — Persistence Requirements Before DB Design (2026-10-01)

**Status:** Evidence boundary; no migration or RPC proposed.

The isolated adapter now proves the semantics that must survive process boundaries. The current Development schema inventory does not show a general Mission Authority/attempt gateway. Therefore the next database design must be derived from these requirements rather than from the existing CRUD tables.

## Minimum durable state semantics

A production implementation must be able to persist and atomically evaluate:

- current authority revision and revocation/expiry state;
- mission/action versions and exact input hash;
- lease identity and expiry;
- exact audience/destination/resource binding;
- approval identity plus exact action/version/input/destination/revision binding and expiry;
- action/spend budget counters and an atomic reservation;
- execution attempt identity and idempotency key;
- authorization decision/reason code;
- external attempt state: NOT_SENT / ACCEPTED / SUCCEEDED / FAILED / UNKNOWN;
- provider receipt/reference when available;
- reconciliation result and timestamp;
- append-oriented evidence sufficient to correlate authorization → dispatch → receipt/reconciliation → verification.

## Atomicity requirements

The persistent boundary must prevent two concurrent requests from consuming the same remaining budget, and must prevent the same idempotency key from creating two external attempts.

A process-local mutex is not sufficient. The production primitive must establish the same guarantees across independent workers/processes.

## Security requirements

The worker/server must derive identity and ownership from the authenticated/server trust boundary. Client-supplied ALLOW decisions, authority objects, lease state, budgets, or approval flags must not be trusted.

No secret, access token, provider credential, password or raw sensitive input belongs in the decision journal.

## What is intentionally not decided yet

This document does not choose table names, columns, RLS policies, RPC names, queue technology, worker platform, signing format, or provider API.

Those choices require:
1. successful execution of the new isolated adapter tests;
2. a live comparison against the Development schema and grants;
3. a reviewed concurrency/TOCTOU design;
4. an isolated PostgreSQL test demonstrating the required atomic fence.

No hosted Development or Supabase Main change is authorized by this document.


## Read-only hosted Development schema parity check — 2026-10-12

The persistence design was exercised on a disposable PostgreSQL 17 stack, including independent-session idempotency, budget-reservation, dispatch-claim, and reconciliation-claim race proofs. The W72 integration uses fake providers and proves durable ledger settlement; it does not prove the hosted Development database has the same schema.

A read-only inventory of hosted `ZAVQERA Development` found migration history stops at W65. The branch includes W66, W68–W71, and W73–W79 migrations. The hosted `agent_executions` table is missing the newer dispatch-claim and reconciliation-claim columns, and the current table inventory did not show `mission_authority_budgets` or `mission_authority_budget_reservations`.

**Status:** persistent gateway/fence is verified locally; hosted schema parity remains **BLOCKED / NOT VERIFIED**. Do not close the live-schema acceptance criterion and do not apply migrations here: this project’s Mission Authority issue guardrails prohibit changes to the hosted Development schema. A separate authorized migration plan/review is required before hosted Research or provider dispatch can be certified.

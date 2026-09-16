# NEXO Follow-through MVP v0.4 — Mission Control Core

## Goal
Deepen the MVP from a UI demonstration into a domain model that explicitly separates:

**Intent → Delegation → Execution Lease → Authorization Decision → Action → Ledger**

## Added
- `ExecutionLease` domain object with expiry, revocation, action budget and spending budget.
- `MissionLedgerEntry` append-oriented event model.
- `AuthorizationRequest` / `AuthorizationResult` model.
- Deterministic demo authorization engine.
- Repository support for reading the current lease and mission ledger.
- Mission now carries lease/delegation references.

## Security boundary
The demo authorization engine is **not** a production security boundary. It models the contract only. The real server must re-evaluate authority immediately before provider I/O, as established by the NEXO security chain.

## Non-goals
- No Supabase Main writes.
- No payment integration.
- No external provider calls.
- No client-side trust for authorization.
- No new database schema deployed.

## Next gate
Implement the server-side Lease/Authorization contract only after the canonical 001–020 source is recovered or compatibility-isolated with evidence, then validate PostgreSQL 17 behavior and concurrency before touching Main.

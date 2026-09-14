# NEXO v1.2 — Mission Recovery & Crash Semantics

## Purpose
v1.2 defines what happens when a mission runtime crashes, a provider disappears, or an external side effect has an uncertain outcome.

## Recovery law
**Never retry an external side effect from uncertainty. Reconcile first.**

The recovery path is:

`durable checkpoint → validate tenant/mission/version/digest → replay durable kernel events → restore authority/budgets → classify external outcome → resume OR reconcile OR stop`

## External outcome states
- `notSent`: no evidence that the external side effect crossed the adapter boundary.
- `sentUnknown`: the request may have crossed the boundary but confirmation is unavailable. This state MUST reconcile before retry.
- `confirmedSuccess`: external evidence confirms the intended effect.
- `confirmedFailure`: external evidence confirms failure and normal retry rules may be considered.

`sentUnknown` is not success, failure, or permission to retry.

## Durable invariants
1. Mission and organization binding must match.
2. Checkpoint must be present and have a non-empty state digest.
3. Recovery cannot increase authority, action budget, or spending budget.
4. Authority Passport and Delegation survive agent/provider changes unchanged.
5. Terminal missions do not automatically resume.
6. Ledger replay must advance exactly one version per event.
7. Ledger events from another tenant/mission fail closed.
8. Version gaps fail closed.
9. State mismatch during replay fails closed.
10. Recovery itself performs no external I/O.

## Crash scenarios
### Provider crash before send
Treat as `notSent` only when the adapter/runtime has durable proof that no side effect was sent. Otherwise use `sentUnknown`.

### Timeout after send
Use `sentUnknown`. Reconcile by provider/external reference or idempotency key. Never blindly resend.

### Worker crash during verification
Restore the last durable checkpoint and verification state. Do not convert missing verification into completion.

### Agent replacement
Bind the new agent to the existing Mission/Delegation/Authority Passport. Agent replacement is not a new delegation.

## Replay model
v1.2 intentionally remains event-sourcing-lite: the database will be the durable authority, while the Flutter kernel defines deterministic replay semantics. Full event sourcing is deferred until backend replay, storage, retention, and migration requirements are proven.

## Production gate
This is still a contract/prototype layer. It does not certify Supabase Main, provider integrations, cryptographic key management, or real external reconciliation.

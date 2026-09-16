# NEXO Follow-through MVP v0.3 — Mission Control Boundary

## Purpose

v0.3 turns the previous Intent Builder demo into a local command-boundary prototype for the NEXO Mission Control model.

## New concepts

- Mission approval is explicit.
- Execution authority is represented by a short-lived Execution Lease.
- A lease is bounded by time and mission scope and can be revoked.
- Starting execution is rejected until authority is approved.
- Resuming after lease expiry is rejected and requires re-authorization.
- Agent strategy is not authority: this prototype keeps authority outside the agent runtime.

## Flow

`Goal → Intent → Mission → Authority Approval → Execution Lease → Action Authorization → Execution → Evidence → Verification → Outcome`

## Important boundary

This is a local deterministic prototype. It does not write to Supabase Main and does not claim production security. The real Execution Lease and Authorization Boundary will be implemented server-side only after the PostgreSQL/security gates are passed.

The local repository now supports a bounded Continue action loop for already-authorized demo actions. It records action start/success ledger events and enters `NEEDS_USER` before an action that requires approval. This is product-layer behavior only; it is not provider execution, backend authorization, or production evidence.

The mission screen also exposes local progress tracking for each step. A user can
record `RUNNING`, `WAITING`, `SUCCEEDED`, or `FAILED` status, an outcome note,
and a follow-up date through the repository boundary. Execution-owned
`AUTHORIZED` and `COMMITTED` states remain protected from manual mutation.
These updates are in-memory demo persistence and do not represent backend or
provider state.

The current local app starts with a single in-memory mission and does not restore
data after an application restart. A multi-mission list and durable persistence
remain product follow-up work; no backend or cloud storage is introduced by this
MVP slice.

The application layer also exposes a provider-neutral follow-through engine that re-checks the lease fence, dispatches through the existing execution gateway, accepts evidence through a verifier port, and commits only a protocol-valid verified outcome. Its adapter and verifier ports are replaceable; no real external side effect or production certification is implied.

## Next implementation

1. Add persistent Mission Ledger events.
2. Bind lease to delegation/policy/action revision.
3. Add server-side authorization immediately before external side effects.
4. Add lease fencing, heartbeat and stale-worker rejection.
5. Add evidence/verification/outcome state transitions.
6. Then connect the repository to the canonical backend.

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

## Next implementation

1. Add persistent Mission Ledger events.
2. Bind lease to delegation/policy/action revision.
3. Add server-side authorization immediately before external side effects.
4. Add lease fencing, heartbeat and stale-worker rejection.
5. Add evidence/verification/outcome state transitions.
6. Then connect the repository to the canonical backend.

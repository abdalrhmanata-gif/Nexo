# NEXO v1.1 — Mission Kernel

## Purpose
The Mission Kernel is the deterministic control nucleus of NEXO. It unifies mission runtime state, authority bindings, version fencing, ledger events, checkpoints, recovery binding, handoff constraints, and provider routing without performing external I/O.

## Core principle
**Agents think and act. NEXO owns the mission, authority, and outcome.**

The kernel treats the Mission as the durable identity above any agent, model, or provider.

## State nucleus
A `MissionKernelSnapshot` binds:
- mission + organization
- runtime state + optimistic version
- Authority Passport + Delegation
- current Action Revision binding
- Execution Lease
- selected agent/provider/model
- remaining action and spending budgets
- checkpoint + state digest
- last event and verification reference

Authority identifiers and budgets are not owned by the selected model.

## Commands
The kernel supports:
- start / pause / wait / request user / resume
- replan
- handoff
- intelligence selection
- begin verification
- complete / fail / cancel
- recover

Every command is version-fenced by `expectedVersion` and bound to mission + organization.

## Security invariants
1. Stale versions fail closed.
2. Cross-tenant or cross-mission commands fail closed.
3. Duplicate command IDs are idempotent in the kernel process.
4. Replanning cannot expand action or spending budgets.
5. Handoff cannot expand authority.
6. Provider/model selection cannot mutate authority or budgets.
7. Changing an action revision is treated as a new authorization boundary.
8. Completion requires explicit verification success.
9. Recovery requires checkpoint/state-digest binding.
10. The kernel performs no external side effect.

## Ledger model
v1.1 uses an append-only kernel event ledger as the control history, while intentionally avoiding a premature commitment to full event sourcing. The authoritative database remains the future durable source; the Flutter implementation is a deterministic contract/prototype.

## Recovery
Crash recovery is conceptually:

`last durable checkpoint → replay authoritative kernel events → restore version/budgets/authority → resume only from a valid state`

An UNKNOWN external outcome remains UNKNOWN and must be reconciled before a retry. The kernel does not convert uncertainty into success.

## Handoff
Agent A can hand the mission to Agent B without creating new authority. The mission's existing authority passport/delegation remains the security root. Any attempted authority expansion must be rejected and separately authorized.

## Routing
Provider/model selection is an execution optimization. It may change the selected provider while preserving mission, delegation, authority passport, action revision, and budgets.

## Boundary
Inside kernel:
- deterministic state transition
- security bindings
- version fencing
- event creation
- checkpoint/recovery contract

Outside kernel:
- network I/O
- provider API calls
- tool adapters
- secrets
- database persistence implementation
- real cryptographic signing
- human approval UI

## Production status
v1.1 is a contract/prototype layer. It is **not production-certified** and does not change Supabase Main. Real backend integration remains gated on PostgreSQL 17 compatibility replay, live concurrency/security tests, and production preflight.

# NEXO v0.5 — Authorization Boundary

## Objective
Make the final external side-effect decision deterministic, revision-bound,
and fail-closed.

## Control path
Intent → Delegation → Policy → Authority Budget → Mission → Action Revision →
Execution Lease → JIT Authorization → Adapter → External System

## Invariants
1. A model cannot authorize itself.
2. An expired/revoked lease cannot cross the external-I/O boundary.
3. A lease cannot expand delegation, budget, tools, or action classes.
4. Security-relevant action changes create a new Action Revision.
5. Authorization binds to the exact action revision and input hash.
6. Policy DENY/REQUIRE_APPROVAL is a hard stop.
7. Infrastructure worker lease and Mission Execution Lease remain separate.
8. Client checks are advisory; server-side checks are authoritative.
9. External success is not assumed from an agent response.
10. UNKNOWN external outcomes require reconciliation, never blind retry.

## Why this matters
Modern agent runtimes can run asynchronously and accept steering while a task
is active. NEXO therefore treats authority as time-bounded state, not as a
property of the model session.

## Production boundary
The Dart implementation is a contract/demo. Before production, the same
invariants must be enforced atomically in PostgreSQL/server-side worker code,
with real concurrency tests, ownership/grants inspection, and provider
reconciliation tests.

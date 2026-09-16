# NEXO v1.5 — Mission Policy Engine

## Purpose
The Mission Policy Engine is the governance decision layer between delegated authority and JIT execution. It answers: **may this exact action proceed now, under the current policy?**

It does not create authority, change a Mission's budget, mutate an approved Action Revision, or call external systems.

## Decision chain
`Intent → Delegation → Policy → Risk → Approval → JIT Authorization → Execution`

## Fail-closed rules
- Missing mission/action/revision identity → DENY.
- Inactive delegation → DENY.
- Inactive execution lease → DENY.
- Negative cost → DENY.
- No matching policy → DENY.
- Explicit deny → DENY.
- Approval-required policy without approval → REQUIRE_APPROVAL.
- Only an explicit ALLOW can proceed to the next JIT boundary.

## Rule precedence
Rules are ordered by descending priority. The highest-priority matching rule wins. This makes policy behavior deterministic and auditable.

## Security boundary
This Dart implementation is a deterministic contract/model, not the production security boundary. The server must re-evaluate policy immediately before external I/O using authoritative database state. Client-side policy decisions are advisory only.

## Non-expansion invariant
Policy can narrow execution but cannot expand the authority already granted by the Delegation, Authority Passport, Action Revision, or Execution Lease.

## Next
v1.6 should define a durable **Authorization Decision Record + JIT Authorization Token/Envelope** so every allow/deny/approval decision can be bound to an exact action revision and execution attempt without introducing provider-specific coupling.

# NEXO v0.6 — Mission Continuity & Cross-Agent Handoff

A long-running Mission may move from Agent A to Agent B without creating a new intent or expanding delegated authority.

## Core invariant
**Authority belongs to the Mission/Delegation, not the Agent.**

A handoff transports continuity state and a bounded authority snapshot. It does not mint authority, transfer credentials, or authorize an external side effect.

## Acceptance gates
1. Active and unexpired handoff.
2. Exact organization and Mission binding.
3. Exact target Agent binding.
4. Same current Delegation.
5. Handoff action/tool scope is a subset of current authoritative scope.
6. Remaining budgets can only stay the same or decrease.
7. No success criterion, policy, expiry, approval requirement, or data scope may be weakened.
8. Acceptance itself never authorizes I/O.
9. External I/O still requires server-side JIT authorization immediately before the side effect.

## Identity separation
Agent B receives Mission continuity state, not Agent A's identity, credentials, secrets, or private context.

## Cryptography
Hash fields are contract placeholders in this MVP. Signing, key custody, rotation, and verification are intentionally deferred to v0.7. Client-generated values are never a trust boundary.

# ZAVQERA Controlled Adapter — Isolated Implementation Record (2026-10-01)

**Issue:** #24  
**Branch:** `zavqera/alternative-web-deployment`

## Implemented

- `apps/web/lib/mission-authority/controlled-adapter.mjs`
  - provider-neutral authoritative decision store
  - exact tenant/mission/action/version/input-hash binding
  - authority/policy/lease/approval checks
  - action/spend budget reservation under a mutex
  - idempotency replay rejection
  - durable-shaped attempt and decision correlation in the disposable test store
  - explicit UNKNOWN and reconciliation state
  - controlled adapter dispatch only after ALLOW
  - fake external system with deterministic outcomes

- `apps/web/test/mission-authority-controlled-adapter.test.mjs`
  - positive authorized execution
  - cross-tenant denial
  - stale mission/action/authority denial
  - revoked/expired lease denial
  - destination mismatch denial
  - approval-required refusal
  - input-hash mismatch refusal
  - duplicate idempotency refusal
  - concurrent single-budget enforcement
  - UNKNOWN after-send reconciliation
  - UNKNOWN before-send reconciliation
  - journal secret/payload exclusion

## Explicit limits

Revocation is deny-over-allow: stored revocation or `revoked: true` in the request
denies before idempotency handling, budget reservation or dispatch. Optional
request validity/lease restrictions can only narrow stored authority; a later
request expiry, `revoked: false` or `leaseActive: true` cannot restore permission.
Stored expiry/lease deadlines must be valid, and inactive stored authority or
lease is denied. Invalid supplied validity bounds fail closed.

Only an authorization decision of ALLOW reaches dispatch. An UNKNOWN/transport
failure after that authorized dispatch returns RECONCILE_REQUIRED and prevents
another dispatch on replay; it cannot retroactively undo the first send.
Regression cases cover both request restrictions and authoritative state,
exact/missing/mismatched approvals, concurrent budget reservation and no resend
while reconciliation is required.

This slice is an executable **server-side boundary prototype**, not production persistence. The authority store and attempt journal are in-memory so the exact enforcement semantics can be tested without inventing schema/RPCs prematurely. It is not yet wired to a real provider, hosted environment, or production credentials.

Therefore it does **not** claim:
- production durability;
- PostgreSQL TOCTOU guarantees;
- production worker identity;
- real provider reconciliation;
- universal coverage of every future external adapter.

## Gate decision

The first safe implementation seam now exists and is testable in isolation. The next gate is to run the new Node test file in trusted CI/local infrastructure, then replace only the proven persistence seam with the minimum database/worker primitives actually required by the evidence.

No Supabase Main, hosted Development schema, protected PR, production deployment, billing, or provider credentials were changed.

# NEXO v1.6 — JIT Authorization Decision Record

## Purpose
Create a durable, auditable record explaining why one exact action revision was allowed, denied, or held for approval.

## Binding
Every decision is bound to organization, mission, action, action version, exact input hash, Authority Passport, delegation, policy-set hash, tool, authority class, cost/currency, and a short expiry window.

## Decision semantics
- ALLOW: all required gates passed.
- DENY: a hard security/governance gate failed.
- REQUIRE_APPROVAL: policy permits the action only after a required approval is satisfied.

## Hard rule
A JIT decision never grants new authority. It is a runtime decision over authority already delegated to the Mission/Action.

## Execution rule
The execution boundary must re-check that the decision is still usable and that the exact action revision/input hash matches. A stale, expired, or mismatched decision fails closed.

## Audit value
The record answers: WHO authorized WHAT, for WHICH mission, under WHICH authority, policy and approval, using WHICH action revision and input, at WHAT cost, and UNTIL WHEN.

## Production note
This v1.6 contract is an application-layer model. Production implementation must persist the record server-side, use authoritative policy/delegation state, bind it to the execution run, and protect it with append-only/audit controls. No production certification is claimed.

# NEXO v1.9 — Security Constitution

## Purpose

NEXO v1.9 defines cross-cutting security invariants that must hold regardless of
agent, model, provider, adapter, UI, or execution path.

## Constitutional laws

1. **No Authority Expansion** — an agent may not obtain more authority than the
   active delegation/passport permits.
2. **No Cross-Tenant Execution** — organization boundaries are hard security
   boundaries.
3. **No Execution Without JIT Authorization** — a queued or prepared action is
   never sufficient authority to create an external side effect.
4. **No Commit Without Verification** — execution success is not business outcome.
5. **No Retry of UNKNOWN Without Reconciliation** — uncertain external state is
   quarantined until reconciled.
6. **No Agent-Owned Authority** — authority belongs to the human delegation/mission.
7. **No Provider-Owned Mission State** — provider changes cannot redefine mission
   identity, authority, budgets, or success criteria.
8. **No Client-Owned Security Boundary** — UI/client checks are advisory; server
   enforcement is authoritative.
9. **No Silent Mission Mutation** — security-relevant mission identity, scope,
   budgets and success criteria cannot silently change after freeze.
10. **No Budget Resurrection After Recovery** — recovery cannot recreate consumed
    authority or spending/action budget.

## Enforcement layers

The Constitution is intended to map to:

**Static Tests → Database Constraints/RLS → Command Functions → JIT Runtime Guards
→ Adapter Boundary → Verification → Outcome Commit → Audit/Trust Graph**

A layer must not weaken a stronger layer.

## Non-negotiable rule

If an invariant cannot be proven, NEXO must fail closed rather than infer safety.

## Scope

v1.9 is a contract and guard implementation. It does not certify production
security. Live PostgreSQL concurrency, RLS, ownership, grants, and worker tests
remain separate certification gates.

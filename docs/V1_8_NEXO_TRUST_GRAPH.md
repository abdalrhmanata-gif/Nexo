# NEXO v1.8 — Trust Graph

## Purpose

The Trust Graph is a machine-readable relationship layer over the NEXO control chain.
It answers not only "what happened?" but "what authorized, governed, caused, supported,
verified, and resulted in this outcome?"

## Canonical graph

Principal
→ Intent
→ Mission
→ Delegation
→ Authority
→ Policy
→ Authorization Decision
→ Agent
→ Action
→ Tool
→ Execution
→ External Event
→ Evidence
→ Verification
→ Outcome

## Invariants

1. Every node is organization-bound.
2. Every edge is organization-bound and cannot cross tenants.
3. The graph never grants authority.
4. Graph membership is not proof of authorization; authoritative authorization remains
   the policy/JIT decision boundary.
5. An Outcome is explainable only when its graph has both causal linkage and verification.
6. Evidence supports verification; it does not become truth merely by being present.
7. Agent/provider replacement must preserve mission/authority relationships.
8. Superseded revisions remain traceable rather than silently overwritten.

## Architecture choice

v1.8 deliberately uses a graph contract without introducing a graph database.
PostgreSQL can represent these relationships initially. A dedicated graph store is only
justified if traversal, scale, latency, or analytical requirements prove it necessary.

## Strategic value

The Trust Graph can later power audit views, incident reconstruction, compliance,
explainable automation, policy analytics, and machine-readable trust assertions.

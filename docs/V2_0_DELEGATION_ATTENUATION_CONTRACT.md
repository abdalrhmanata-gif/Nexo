# NEXO v2.0 — Delegation Attenuation Contract

Status: additive local contract/test artifact; not a production authorization engine and not a database schema proposal.

## Purpose

Prove that a child delegation can only reduce authority inherited from its parent.

## Invariants

- child scope is a subset of parent scope
- child allowed actions are a subset of parent allowed actions
- child denied actions are a superset of parent denied actions
- child budget is no greater than remaining parent budget
- child expiry is no later than parent expiry
- child risk ceiling is no greater than parent risk ceiling
- approval and evidence requirements are equal or stricter
- tool/provider scope is a subset of parent scope
- remaining delegation depth strictly decreases

## Enforcement boundary

This contract never directly authorizes side effects. Existing JIT authorization remains the final decision and final side-effect gate.

## Safety

No Supabase Main changes. No Candidate Core v0.3. No production certification claim.

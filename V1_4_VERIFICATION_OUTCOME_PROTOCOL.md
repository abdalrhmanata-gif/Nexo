# NEXO v1.4 — Verification & Outcome Protocol

## Purpose

v1.4 establishes a hard boundary between execution claims and verified mission outcomes.

**Tool/provider response is evidence input, not proof of business success.**

The protocol binds verification to:

- organization
- mission
- action
- execution run
- exact execution input hash
- success-criteria hash
- evidence

## Lifecycle

`EXECUTION → EVIDENCE → VERIFICATION → OUTCOME → MISSION COMPLETION`

An execution may report `SUCCEEDED`, but NEXO must still verify the required success criteria before committing a mission outcome.

## Verification states

- `PENDING` — not resolved
- `PASSED` — evidence satisfies the criteria
- `FAILED` — evidence contradicts the criteria
- `INCONCLUSIVE` — evidence is insufficient; no success may be committed

## Outcome rules

1. An outcome must bind to exactly one execution run and verification result.
2. Cross-organization or cross-mission bindings fail closed.
3. A committed outcome must be explicitly verified.
4. `UNKNOWN` cannot become verified success without reconciliation and fresh evidence.
5. Full `SUCCESS` requires a full success score in this MVP contract.
6. Verification confidence is bounded to `[0,1]`.
7. Verification requires at least one evidence reference.
8. The verifier records rationale so a later auditor can understand why the result passed.

## Important distinction

`provider says success` ≠ `verification passed` ≠ `business outcome committed` ≠ `mission completed`.

This separation prevents an agent, tool, or provider from self-certifying the result of its own side effect.

## Kernel boundary

The protocol is deterministic and has no external I/O. Adapters produce evidence; the verification layer evaluates evidence; the outcome layer commits the durable business result; the Mission Kernel consumes the resulting fact.

## Production follow-up

The MVP contract intentionally does not choose a universal evidence ontology, cryptographic attestation format, or domain-specific verifier registry. Those should be frozen after threat modeling and real execution-provider validation.

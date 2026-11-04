# ZAVQERA Follow-through MVP v1.9

ZAVQERA is the mission control plane for autonomous AI: it turns human intent into bounded, verifiable authority for long-running AI missions.

## v1.0 — Mission Runtime Contract

This release turns the MVP from a provider-aware execution demo into a durable mission runtime contract.

### Added
- Durable Mission Runtime state machine
- WAITING / NEEDS_USER as first-class continuation states
- Optimistic mission-version fencing
- Mission checkpoints binding authority, delegation, action revision, lease, budgets and state digest
- Append-only runtime-event contract
- Fail-closed completion: VERIFYING is required before COMPLETED
- Explicit separation of runtime state from authority
- Provider/model changes remain implementation choices

### Architecture
Intent → Principal → Mission → Delegation → Policy → Authority Passport → Intelligence Router → Execution Gateway → JIT Authorization → Adapter → External System → Evidence → Verification → Outcome

### Security position
AI can reason and replan. ZAVQERA remains authoritative over mission identity, delegated authority, budgets, policy, verification and outcome. No model output, tool output, webhook or runtime event is itself permission.

### Scope
Local/demo Flutter contract only. No production credentials. No Supabase Main migration. Production certification remains incomplete until PostgreSQL 17 live concurrency, ownership, grants, provider ambiguity, webhook, OAuth, SSRF and secret-boundary tests pass.


## v1.1 Mission Kernel

The Mission Kernel unifies durable mission state, authority bindings, event ledger semantics, checkpoints, recovery constraints, handoff, and provider routing. See `docs/V1_1_NEXO_MISSION_KERNEL.md`.

## v1.2 Recovery Contract
Mission recovery is defined by `lib/domain/mission_recovery.dart` and `docs/V1_2_MISSION_RECOVERY_CRASH_SEMANTICS.md`. UNKNOWN external outcomes require reconciliation before retry; recovery preserves mission authority and budgets and fails closed on invalid durable bindings.


## v1.4 — External Execution Protocol
Defines the provider-neutral Invocation Envelope and external outcome semantics connecting the Mission Kernel to workers/adapters. UNKNOWN outcomes require reconciliation before retry or commit.


## v1.4 — Verification & Outcome Protocol
Execution claims are now separated from verified business outcomes. Verification binds to the exact execution run, input hash, success criteria and evidence; UNKNOWN outcomes cannot be committed as verified success. See `docs/V1_4_VERIFICATION_OUTCOME_PROTOCOL.md`.


## v1.6 — Mission Policy Engine

Deterministic governance layer for policy, risk, approval, and fail-closed JIT eligibility. Policy never expands authority and production authorization remains server-side.

## Engineering verification boundary

This project now includes the v1.7 provenance chain, v1.8 trust graph, and v1.9 security constitution as additive application contracts.
These contracts do not certify production security and do not replace server-side authorization, PostgreSQL constraints/RLS, live concurrency tests, provider reconciliation, or production evidence gates.

Use `./tool/verify_project.sh` in a Flutter-enabled environment to run dependency resolution, formatting, static analysis, and the complete Dart/Flutter test suite. In a non-Flutter environment the script fails closed with exit code 20 after completing the static contract gate.

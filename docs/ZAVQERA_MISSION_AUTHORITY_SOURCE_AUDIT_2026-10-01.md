# ZAVQERA Mission Authority — Source Audit (2026-10-01)

**Scope:** Read-only source audit of the feature branch `zavqera/alternative-web-deployment`, followed by this documentation-only record.  
**Related contract:** [Mission Authority Contract v0.1](./ZAVQERA_MISSION_AUTHORITY_CONTRACT_v0.1.md)  
**Status:** Core invariants exist as prototype/domain contracts; production server-side enforcement is **not demonstrated** by the reviewed source. No application code, schema, deployment, or billing was changed in this step.

## Executive result

The repository already contains substantial architecture and prototype code for policy decisions, leases, execution routing, verification, and outcomes. The key limitation is explicitly documented in the source itself: these Dart components are client/demo or contract implementations and do not replace a server-side authorization boundary.

The source path reviewed does **not** establish that every real external side effect passes through an authoritative server-side JIT gateway. The provider adapters currently visible are demo adapters. Therefore the right next implementation is not to add another generic Dart authorization class or invent database tables. First identify and design the smallest server/adapter enforcement seam; then implement it behind tests and an isolated environment.

## Source-by-source findings

| Source | Observed behavior / source statement | Assessment |
|---|---|---|
| `lib/application/execution_gateway.dart` | Selects an adapter from a map and calls `adapter.execute(request)`; no authorization, current revocation, lease, policy, budget, or durable-attempt lookup occurs in this method. | **Prototype routing only.** Must not be treated as the security boundary. |
| `lib/domain/execution_gateway.dart` | Request binds mission/action/version/organization/passport/agent/provider/model/instruction/input; no explicit idempotency key, execution attempt ID, destination/audience, or input hash field appears in this request shape. | **Partial binding.** Existing protocol docs require additional revision/attempt bindings for side effects; reconcile shape before changing it. |
| `lib/application/jit_authorization_engine.dart` | Evaluates caller-supplied booleans for delegation, passport, policy, approval, and lease. Produces a decision record with action/input identity. | **Deterministic model, not authoritative data loading.** It does not itself fetch current state or atomically reserve budgets. |
| `lib/application/mission_policy_engine.dart` | Explicitly says it is deterministic and side-effect-free and production authorization must repeat server-side at JIT. | **Client/application policy boundary only.** |
| `lib/application/authorization_engine.dart` | Explicitly calls itself a deterministic client-side model and says it is intentionally not a security boundary. | **Prototype only.** |
| `lib/application/mission_control_boundary.dart` | Source comments identify it as a deterministic client/demo representation and state it never replaces server-side authorization. | **Lease/action fence model, not server enforcement.** |
| `lib/application/mission_followthrough_engine.dart` | Checks action/missions/version/input bindings, runs the client control boundary, calls the execution gateway, verifies the returned execution, then commits a protocol-valid outcome. Source comments state it does not provide production authorization or external infrastructure. | **Useful orchestration prototype.** A process-local check immediately before adapter invocation is not proof of server-authoritative atomic enforcement. |
| `lib/application/demo_provider_adapters.dart` | Returns a synthetic “Demo execution completed” response; comments say real adapters must live behind the server-side authorization and secret boundary. | **No real external side effect evidenced by this adapter.** |
| `docs/V0_5_AUTHORIZATION_BOUNDARY.md` | Defines JIT, lease, revision, input-hash, deny/approval and unknown-outcome invariants; explicitly states Dart is contract/demo and production needs atomic PostgreSQL/server-side worker enforcement and real concurrency/reconciliation tests. | **Design contract; production gate open.** |
| `docs/V0_7_CRYPTOGRAPHIC_AUTHORITY_PASSPORT.md` | Passport claim contract is defined; development HMAC signer is explicitly not production trust; revocation must be checked outside portable passport. | **Portable claim model; production key lifecycle/revocation/replay proof absent from reviewed evidence.** |
| `docs/V0_8_PROVIDER_AGNOSTIC_EXECUTION_GATEWAY.md` | States real adapters must run behind server-side authorization and secrets boundary. | **Architecture intention, not evidence of deployed gateway.** |
| `docs/V1_0_MISSION_RUNTIME_CONTRACT.md` | Version-fenced runtime, provider independence, verification-before-completion. | **Runtime contract.** |
| `docs/V1_2_MISSION_RECOVERY_CRASH_SEMANTICS.md` | Requires reconciliation before retry after uncertain external side effects; says production provider reconciliation is not certified. | **Recovery contract; external integration evidence still needed.** |
| `docs/V1_3_EXTERNAL_EXECUTION_PROTOCOL.md` | Requires action revision, input hash, lease, idempotency and JIT checks; explicitly says it is not a production wire format or cryptographic standard. | **Protocol contract; current request object does not carry every documented binding.** |
| `docs/V1_5_MISSION_POLICY_ENGINE.md` | Deterministic policy model; explicitly says server must re-evaluate immediately before external I/O. | **Policy prototype, not production boundary.** |
| `docs/V1_9_NEXO_SECURITY_CONSTITUTION.md` | Lists security invariants and states live PostgreSQL concurrency, RLS, ownership/grants and worker tests remain certification gates. | **Constitution/acceptance target, not certification.** |
| `docs/MISSION_LEDGER_CONTRACT.md` | Specifies append-oriented, tenant-bound, authority/evidence/outcome-aware ledger semantics. | **Ledger contract; each production path's evidence must still be proven.** |

## Enforcement matrix

| Invariant | Source status | Remaining proof |
|---|---|---|
| Provider/model change cannot expand authority | Documented; prototype routing separates provider choice from authority | Test against authoritative persisted delegation and the real adapter boundary |
| Mission/action/version/input binding | Partially modeled in application orchestration and protocol docs | Unify request/decision/lease/attempt bindings; reject any mismatch server-side |
| Fresh revocation/expiry/lease check at dispatch | Modeled in client/demo checks; not proven at a server dispatch boundary | Authoritative lookup and race-safe enforcement immediately before I/O |
| Policy and exact approval | Policy/JIT models exist | Server loads current policy/approval; decision is bound to exact action/input/destination |
| Atomic budget/action limits | Budget concepts exist in contracts | Database/worker atomic reservation and concurrency/TOCTOU tests |
| Idempotency and replay resistance | Required by protocol | Durable attempt record, adapter/provider semantics, replay tests |
| UNKNOWN reconciliation before retry | Recovery contract exists | Real adapter receipts/reconciliation tests and crash/timeout tests |
| Verification before outcome | Application protocol checks exist | Independently verifiable evidence and server-side outcome commit on the real path |
| Cross-tenant denial | Supabase Development schema review found RLS and owner-oriented policies | Two-user isolated E2E plus tests against each actual server mutation/execution route |
| No bypass around gateway | Demo adapters and contracts point toward a server boundary | Inventory all external side-effect entry points and prove each is routed through one controlled boundary |

## Existing Development database constraints to preserve

The prior read-only Development inventory recorded seven application-owned public tables, RLS enabled on all seven, 18 policies, 13 triggers, and five intended authenticated mutation RPCs. That inventory did not prove a general external-agent JIT gateway. Do not infer one from those RPCs.

The auth hook calls `private.handle_new_user_profile()`. Any future disposable schema snapshot must preserve the real hook binding and must not substitute the similarly named public function. No schema, grant, trigger, RLS, or migration changes were made as part of this audit.

## Recommended implementation sequence

1. **Boundary inventory (next):** enumerate every call site capable of invoking a provider, browser, API, webhook, or other external side effect. Mark each as demo-only, internal-only, or real external I/O. Confirm whether a server/worker implementation exists in the active branch.
2. **Interface proposal (before code/schema):** define a provider-neutral server-side request/result interface carrying tenant, mission/version, action/version/input hash, authority revision, delegation/passport, audience/destination, lease, attempt ID, idempotency key, policy version, budget reservation, approval reference and stable decision reason.
3. **Controlled test adapter:** implement the smallest server-side enforcement seam with a fake external system first; do not connect production credentials.
4. **Negative and concurrency tests:** expired/revoked authority, stale revisions, changed input/destination, missing approval, budget races, cross-tenant IDs, replay/duplicate key, timeout/UNKNOWN, and verification refusal.
5. **Isolated end-to-end:** follow `apps/web/README.md`; run only on a disposable local Supabase stack, never hosted Development. Preserve verified teardown evidence.
6. **Only then** propose a narrowly scoped migration/RPC change if source and live-schema comparison proves it necessary.

## Explicit non-claims

- This audit does not certify production security or prove every external side effect is currently mediated.
- No tests/build were run in this step; it was a source review and documentation-only commit.
- No real provider integration, server-side gateway, production signing, budget-race test, E2E pass, or cleanup proof is claimed.
- Supabase Main, Git `main`, protected PRs, deployment configuration, billing, DNS and hosted schema remain untouched.

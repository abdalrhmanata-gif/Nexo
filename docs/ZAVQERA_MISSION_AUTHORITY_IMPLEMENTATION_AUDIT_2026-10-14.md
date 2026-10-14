# ZAVQERA Mission Authority implementation audit — 2026-10-14

**Status:** Source-and-test audit of the candidate branch; not a production security certification.  
**Reviewed contract:** `docs/ZAVQERA_MISSION_AUTHORITY_CONTRACT_v0.1.md`.  
**Candidate head:** `1713ce57a09b092bdcc5c28d3c2be39776972c26` (PR #39, Draft / unmerged).  
**Database evidence:** W21 disposable local PostgreSQL 17 / Supabase replay, pgTAP, browser E2E and cleanup all passed on this source head. No hosted Supabase or production resource was used.

## Decision summary

The candidate now has a real Next.js HTTP test for the protected Mission Action worker route, a shared authenticated parser/operation handler, a streaming request-body ceiling, and disposable PostgreSQL 17 evidence for the current SQL claims and races. This is materially stronger than the original client-only/runtime-contract evidence.

**The universal enforcement claim remains NOT ESTABLISHED.** The production adapter registry is intentionally empty; no live provider dispatch or provider-specific receipt/reconciliation has been exercised. The egress-isolated route test proves behavior for the tested worker route under Docker `--network none`, not that every possible production execution path is forced through one universal network boundary.

## Invariant-by-invariant status

| Required invariant | Status | Exact source / evidence | Remaining limitation |
|---|---|---|---|
| Provider-neutral decision interface and stable reasons | **PARTIAL — candidate interface exists** | `apps/web/lib/mission-authority/mission-action-worker-boundary.mjs`; `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs`; `apps/web/lib/mission-authority/controlled-adapter.mjs`; `apps/web/test/mission-action-worker-boundary.test.mjs`; `apps/web/test/persistent-dispatch-gateway.test.mjs` | The interface governs the tested candidate path, not every production side-effect path. |
| Trusted worker authentication before body read | **IMPLEMENTED for the protected route** | `apps/web/lib/mission-authority/trusted-worker-http.mjs`; `apps/web/app/api/internal/agent-executions/[executionId]/route.ts`; `apps/web/test/research-completion-schema-preflight.test.mjs`; actual-route test | Test credentials are local-only. Deployment secret rotation and operational token lifecycle were not tested here. |
| Request body size enforced while streaming | **IMPLEMENTED and tested** | `parseTrustedWorkerRequest` in `trusted-worker-http.mjs`; `apps/web/test/mission-action-runtime-boundary.integration.test.mjs`; `apps/web/test/mission-action-route-runtime.integration.test.mjs` | The 160 KB cap bounds parser accumulation. Reverse proxies/runtime ingress need their own request limits too. |
| Chunked body without Content-Length cannot bypass size limit | **IMPLEMENTED and tested** | Actual Next.js HTTP test sends a chunked POST without `Content-Length`, expects 413 + `no-store`; Web Unit run [38623432225](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38623432225) | The test covers the tested local route under the CI runner's network setup, not every proxy/runtime configuration. |
| Missing/unreviewed adapter fails before privileged-client creation | **IMPLEMENTED for candidate route; live integration intentionally disabled** | `provider-adapter-registry.mjs`; `mission-action-worker-boundary.mjs`; `trusted-worker-http.mjs`; `mission-action-route-runtime.integration.test.mjs` | `TRUSTED_DISPATCH_ADAPTERS` is empty by design; no real provider adapter is registered. |
| Exact action/request/audience/approval/lease bindings at JIT | **PARTIAL — candidate SQL/gateway checks and isolated regressions** | `persistent-dispatch-gateway.mjs`; `supabase/migrations/20261011180000_w69_one_time_jit_dispatch_claim.sql`; W57–W80 candidate migrations/tests; W21 run | Isolated replay is not proof that hosted Development has these migrations or that a real provider cannot bypass the gateway. |
| Atomic action/spend budget under concurrent attempts | **IMPLEMENTED in the tested candidate SQL path; provider coupling NOT PROVEN** | W68 budget reservation/settlement; `tool/w68_actual_authority_budget_race.sh`; W21 run [38623420916](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38623420916) | No real provider send was linked to a process-crash/concurrency test. |
| Idempotency and no duplicate dispatch after UNKNOWN | **IMPLEMENTED in candidate gateway/SQL tests** | `persistent-dispatch-gateway.mjs`; W56/W60/W69/W70 migrations and tests; `tool/w67_actual_execution_idempotency_race.sh`; `tool/w69_actual_dispatch_claim_race.sh`; W21 | Provider-side deduplication semantics remain unverified because no real adapter is active. |
| Unknown external result requires reconciliation, not blind retry | **IMPLEMENTED in candidate state machine; real provider lookup NOT VERIFIED** | `persistent-dispatch-gateway.mjs`; `controlled-adapter.mjs`; `tool/w70_actual_reconciliation_claim_race.sh`; W21 W70/W72 tests | No registered provider lookup supplies a real authoritative record. |
| Receipt must be correlatable before confirmed success | **PARTIAL — receipt checks exist** | W75/W76 candidate migrations/tests; `persistent-dispatch-gateway.mjs`; gateway tests | Shape/correlation checks do not authenticate a provider or prove the business result without a real integration. |
| Verification before outcome commit | **PARTIAL** | Existing verification/outcome RPCs and lifecycle tests; `docs/MISSION_LEDGER_CONTRACT.md` | End-to-end dispatch → real receipt → independent verification → outcome commit is not proven against a live provider. |
| Research preflight/claim/completion fails closed without trusted DB connection | **IMPLEMENTED and tested on the actual Next.js route** | `apps/web/app/api/internal/agent-executions/[executionId]/route.ts`; `mission-action-route-runtime.integration.test.mjs`; W79 candidate migration/tests | Hosted Development does not have verified parity with the branch candidate; no hosted migration or hosted Research test was performed. |
| Mission Action cannot import the JIT gateway from another API route | **IMPLEMENTED as a static source-graph guard** | `apps/web/test/mission-authority-worker-auth.test.mjs` test: “only the trusted internal worker route transitively reaches Mission Action dispatch modules”; “Mission Action API dependency graphs cannot bypass…” | Static reachability analysis is a guard against known source patterns, not proof against all runtime/native/dependency egress mechanisms. |
| External effects are inventoried and classified | **PARTIAL / inventory exists** | `apps/web/test/mission-authority-worker-auth.test.mjs` test: “every non-Mission outbound API route is explicitly classified in the outbound-effect inventory” | Separate product workflows (planning, read-only research, email, security lookup) have their own authorization semantics. They are not all Mission Action dispatches and are not proven under one universal egress gateway. |
| All external side effects pass through one universal production boundary | **MISSING / NOT PROVEN — central blocker** | Registry remains empty; `mission-authority-worker-auth.test.mjs` proves only static graph constraints for listed routes; the actual route runs under `--network none` in CI | No deployment-level universal egress policy has been established for every server route, worker, SDK, native transport or integration. Do not claim universal enforcement or enable a provider. |
| Production authority passport signing, key rotation, replay/nonce lifecycle and live revocation service | **NOT ESTABLISHED by this candidate** | v0.1 contract describes these requirements and notes development HMAC is not production trust; no corresponding live provider flow is tested here | Must be separately designed/reviewed if required by the provider integration. |
| Hosted Development schema parity | **NOT VERIFIED / BLOCKED from this workflow** | Disposable W21 run on the candidate source head; historical read-only schema reconciliation notes in `docs/ZAVQERA_MISSION_AUTHORITY_DEVELOPMENT_SCHEMA_RECONCILIATION_2026-10-01.md` | W21 uses a disposable local stack and must not be represented as hosted schema parity. No hosted changes were made. |

## Next design gate — provider-neutral decision interface

The companion proposal `docs/ZAVQERA_MISSION_AUTHORITY_DECISION_INTERFACE_v0.1.md` separates authorization decision, execution status and recovery classification; records the mismatch between the `controlled-adapter` and `persistent-dispatch-gateway` vocabularies; and proposes canonical reason codes mapped to the currently observed SQL/gateway values.

This remains **design only**, not integrated code. In particular, `APPROVAL_REQUIRED_OR_SCOPE_CHANGED` is ambiguous and must not be silently normalized into ALLOW or an approval-only state. The existing v0.1 `RETRYABLE_NOT_SENT` semantics must be reconciled explicitly before implementation. No migration/RPC or hosted schema change is proposed by that document.

## Pure reason-code mapper checkpoint — 2026-10-14 — source/test HEAD `90694c7af88ececadcac56fcc82bf32b1ff0cb10`

- Added `apps/web/lib/mission-authority/reason-code.mjs` as a pure exact-code normalizer; unknown inputs fail closed to `DECISION_DEPENDENCY_UNAVAILABLE`.
- Added `apps/web/test/mission-authority-reason-code.test.mjs` to enumerate every SQL `raise exception` in W68–W80 plus the current gateway's known denial codes and explicit reason literals. Test proves all collected source values map to the frozen canonical set; it intentionally fails CI for unreviewed new codes.
- Exact-head Web Unit: 364/364; Web CI/typecheck/build and Flutter CI passed. W21 run `38626086075` has passed PG17/pgTAP, Mission Authority regressions, quota/workspace tests, ledger races and W72 integration; E2E and cleanup remain pending at this note.
- The normalizer is **not wired into the actual route/gateway**: this avoids silently changing existing production response semantics before resolving the legacy decision/state vocabulary and ambiguous approval code. No schema/RPC/hosted change was made.
- Scope limitation: source inventory currently covers candidate W68–W80 exception strings and persistent-gateway reason codes, not all local error codes from `controlled-adapter.mjs`.

## Controlled-adapter source-code inventory expansion — 2026-10-14

The pure reason mapper and inventory test are being expanded to include explicit reasons from `apps/web/lib/mission-authority/controlled-adapter.mjs`, alongside W68–W80 SQL exceptions and persistent-gateway reasons. The mapper intentionally excludes `ALLOW` as a reason because it is a decision, and groups `MISSING_<field>` into a constrained validation family. This is a pre-integration test helper; the actual route/gateway response shapes are unchanged. Fresh exact-head CI/W21 is required before considering this checkpoint validated.

## Exact-head evidence

- Web Unit **361/361 passed** — [run 38623432225](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38623432225)
- Web CI, static boundary checks, TypeScript and production build **SUCCESS** — [run 38623431654](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38623431654)
- Flutter CI **SUCCESS** — [run 38623432230](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38623432230)
- W21 disposable PostgreSQL 17 / pgTAP / concurrency / browser E2E / cleanup **SUCCESS** — [run 38623420916](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38623420916)
- W21 artifacts: `zavqera-w21-evidence`, `zavqera-w21-browser-diagnostics`.

## Scope restrictions and next acceptance gates

No hosted Supabase project, Supabase Main/Production, production deployment, secrets, billing or DNS were changed. No live provider was enabled. PR #39 remains Draft/unmerged, PR #29 remains unchanged, Issue #23 remains open and launch stays NO-GO.

Remaining acceptance work, in order:

1. Independently enumerate all production side-effect entry points (API routes, server actions, workers, provider SDK/native transport entry points) and prove each is either intentionally classified as its own authorized workflow or routed through the enforcing Mission Authority boundary.
2. Define the concrete provider adapter's idempotency, receipt authenticity, lookup/reconciliation and “proven not sent” contract before registering it.
3. Add provider-contract tests for accepted-then-timeout, unknown lookup, duplicate receipt, no-send proof, replay, cross-tenant denial, and late worker completion. Keep the provider registry empty until those gates pass.
4. Compare candidate SQL/RPC signatures to hosted Development read-only before proposing any migration. Do not apply hosted schema changes under this issue's current guardrails.
5. Keep universal egress mediation and production enforcement **NOT ESTABLISHED** until independently reproducible acceptance evidence exists.

This audit is source-and-test based. It does not claim a runtime trace of production infrastructure or provider delivery.


## Exact-head implementation checkpoint — 2026-10-14 — `2874d087983c2b2acd3b5a4b049b15a80b585e0a`

The canonical reason-code mapper is now covered by an exact-source inventory test across W68–W80 SQL exception strings, the persistent worker gateway, and the local `controlled-adapter.mjs` model. It normalizes **158 exact source-code entries to 75 canonical outputs**, treats `ALLOW` as a decision rather than a reason code, handles `MISSING_<field>` as a constrained validation family, and maps unknown/malformed/raw error text to `DECISION_DEPENDENCY_UNAVAILABLE`. It remains a pure helper, not imported by the live route/gateway; current production responses are unchanged.

Exact-head validation:
- Web Unit: **364 passed / 0 failed**, including the actual Next.js worker route under Docker `--network none` and the reason-code inventory — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38627396852
- Web CI / static authorization / TypeScript / production build: **SUCCESS** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38627396644
- Flutter CI: **SUCCESS** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38627396687
- W21 Local Launch Gate: **SUCCESS on this exact head** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38627385823

W21 passed the disposable PostgreSQL 17 migration replay and pgTAP gate; Mission Authority and AI quota/workspace security; actual-ledger idempotency, atomic budget, one-time dispatch-claim and reconciliation-claim race tests; W72 persistent gateway integration with fake providers; full browser E2E; disposable-stack cleanup and cleanup verification; and evidence upload. Artifacts: `zavqera-w21-evidence` and `zavqera-w21-browser-diagnostics`.

This checkpoint **does not** establish universal outbound-network mediation across all production execution paths or real-provider receipt/reconciliation. The provider registry remains empty and the interface/normalizer are not integrated into production responses. W21 used only disposable local PostgreSQL 17/Supabase and fake providers; it did not prove hosted Development schema parity and did not modify any hosted database.

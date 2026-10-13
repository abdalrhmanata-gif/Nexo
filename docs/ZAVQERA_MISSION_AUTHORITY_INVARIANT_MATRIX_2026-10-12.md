# ZAVQERA Mission Authority invariant matrix — 2026-10-12

**Reviewed branch:** `zavqera/ai-planner-integration`  
**Reviewed PR:** #29, OPEN / Draft / UNMERGED  
**Latest PR code/test candidate reviewed:** `be8b96bb7d5448125d0c4134fb6275f02950ff53`  
**Verification set:** W21, W25, Web Unit, Web CI/build, Flutter CI and Netlify preview-route verification completed successfully for this candidate. The W21 evidence artifact records the pull-request merge ref `3869460f4fc1bbaefd1480383654957dec236fb8`; the PR source head is recorded separately above. This matrix is a source and evidence audit, not a claim of universal production enforcement.

## Decision summary

**Issue #23 is not ready to close.** The branch has a meaningful isolated, provider-neutral dispatch/reconciliation seam with fail-closed behavior, persistent claim RPCs, budget reservation controls, audit events, receipt checks and pgTAP/browser evidence. However, the registry is intentionally empty and the gateway module explicitly says no route currently wires a real provider. This is a deliberate safety stop, not a successful proof that every future external side effect is governed. Do not register a real adapter or enable provider I/O as part of this audit.

## Invariant-by-invariant status

| Required invariant | Status | Source and evidence | Remaining proof / limitation |
|---|---|---|---|
| Provider-neutral decision and stable denial reasons | **Partial / implemented in candidate seam** | `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs`; `apps/web/lib/mission-authority/controlled-adapter.mjs`; `apps/web/test/persistent-dispatch-gateway.test.mjs`; `apps/web/test/mission-authority-controlled-adapter.test.mjs` | The seam is not yet the proven universal boundary for all production side effects. |
| Missing/unreviewed provider adapter fails closed | **Implemented; real-provider enablement intentionally missing** | `apps/web/lib/mission-authority/provider-adapter-registry.mjs` is an empty frozen registry and validates exact audience plus both `dispatch` and `reconcile`; `apps/web/app/api/internal/agent-executions/[executionId]/route.ts` returns 503 before claim/client work when no adapter is registered. | Keep the registry empty until a provider-specific threat review and acceptance suite exist. |
| One-time persisted JIT dispatch claim, exact audience, immutable claimed request | **Implemented in candidate path; isolated evidence** | `persistent-dispatch-gateway.mjs`; `persistent-dispatch-gateway.test.mjs`; W68/W69 migrations and pgTAP tests included in disposable W21 replay. | Does not establish that all real-provider integrations use this route. |
| Authority, approval, revision, lease, destination and budget bindings | **Partial / DB-side candidate controls; JIT stale-version cases now covered** | W57 exact approval tests cover changed action/input/destination/provider-model audience, stale mission/action versions before start, expiry, cancellation, authority change and consumed approval. W68 covers budget reservation/settlement. W69 now also asserts that changing the mission version or action version *after start* causes `claim_agent_execution_dispatch` to reject the old approval scope (`stale_mission_version_denied`, `stale_action_version_denied`). | This strengthens the isolated JIT claim regression; it does not prove hosted Development migration parity, every mutation path, or universal enforcement across all side-effect entry points. Keep Issue #23 open. |
| Concurrent starts / budget race / idempotency | **Implemented in isolated candidate path** | W21 on `7a2e559d3f6c3a91b69bce387f2adf98c17ee3d7` reports actual-ledger independent-session idempotency, atomic budget, one-time dispatch and reconciliation claim race proofs. | Hosted Development schema parity is separately unverified; isolated PostgreSQL is not hosted proof. |
| Unknown result never triggers blind redispatch | **Implemented in candidate seam; isolated tests** | `persistent-dispatch-gateway.mjs`; `persistent-dispatch-gateway.test.mjs`; `controlled-adapter.mjs`; `mission-authority-controlled-adapter.test.mjs`. Unknown/ambiguous result is persisted/reported as reconciliation-required. | A real adapter must supply an authoritative lookup implementation; no adapter is registered. |
| Reconciliation requires fresh authoritative evidence and active claim | **Implemented in candidate code/migration; isolated tests** | `supabase/migrations/20261011190000_w70_durable_unknown_outcome_reconciliation.sql`; `supabase/migrations/20261012130000_w74_reconciliation_claim_freshness.sql`; `supabase/tests/w70_durable_unknown_outcome_reconciliation.sql`; gateway test `lookup timestamp must be newer than the current reconciliation claim`. | The new future-dated evidence regression is part of the tested code SHA above. Hosted migration parity remains blocked. |
| Successful external side effect requires correlatable receipt | **Implemented in candidate migration/code; isolated evidence** | W75/W76 migration and tests; gateway checks receipt reference on dispatch/reconciliation; W21 replay includes migrations through W79. | Receipt shape checks do not independently certify provider authenticity or correct provider semantics. |
| Trusted audit events cannot be forged by ordinary users | **Implemented in candidate SQL contract; isolated evidence** | W73 trusted system events migration and pgTAP test; contract section “W73 / W72 exact-head validation”. | Hosted Development has not been migrated to W73. |
| Research completion cannot be forged by authenticated caller and must bind requester | **Implemented in branch candidate; hosted state not current** | `supabase/migrations/20261012180000_w79_trusted_research_completion.sql`; `supabase/tests/w79_trusted_research_completion.sql`; `apps/web/app/api/internal/agent-executions/[executionId]/route.ts`. | Hosted Development was last read-only checked at W65; W79 signature is absent there. Research remains blocked until a separately authorized rollout and exact hosted preflight. |
| Cross-tenant denial / role and approval scope | **W80 fail-closed candidate; isolated gates PASS** | W80 makes `private.can_edit_workspace` false for missing roles, guards approval decisions, preserves W46 workspace-activity logging, hardens W68 budget and W71 stale-recovery role gates, and retains the W78 trusted history boundary. W44 tests the invitation wrapper/helper privilege matrix: public RPCs remain SECURITY INVOKER; private helpers are SECURITY DEFINER with pinned paths; EXECUTE grants match the intended get/create/accept/revoke roles. W71 tests cross-workspace stale-execution reconciliation denial. W21 on the current PR integration completed the disposable PostgreSQL 17/pgTAP gate and Mission Authority/workspace regressions successfully (run 38384206748). | This is isolated CI evidence only. Hosted Development migration parity, all mutation paths, and universal enforcement across all external side-effect entry points remain unverified. Keep Issue #23 open. |
| All external side effects pass through this gateway | **Missing / not proven** | `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs` explicitly states no route currently wires a real provider; `provider-adapter-registry.mjs` is intentionally empty. The internal route is fail-closed until reviewed adapter registration. | This is the central blocker for the universal enforcement claim. Before any provider is enabled, enumerate side-effect entry points, prove they cannot bypass the gateway, review the concrete adapter, and add real-boundary contract tests. |
| Live Research with persisted citations/history, real email, password reset, manual visual QA | **External release gates not verified** | `docs/ZAVQERA_LAUNCH_GATES_STATUS.md`. | Separate authorized preview-only tests are required. These are not substitutes for the JIT gateway proof. |

## Exact automated evidence — current PR update (2026-10-13)

Current PR code/test candidate reviewed: `be8b96bb7d5448125d0c4134fb6275f02950ff53`.

- W21 Local Launch Gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206748
- W21 evidence/cleanup artifact — `postgres_major=17`, `cleanup_verified=true`, no remaining containers or volumes: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206748/artifacts/11805171305
- W21 browser diagnostics — unregistered adapter denied with HTTP 503 and `providerCall=not_attempted`; browser E2E reports `2 passed`: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206748/artifacts/11804922028
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206763
- Web Unit — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206782
- Web CI/build — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206772
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206787
- Netlify preview-route verification — **PASS**; the deploy job was skipped because this migration/test/docs-only update does not require a live deploy: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206826

The workflow artifact records the pull-request merge ref `3869460f4fc1bbaefd1480383654957dec236fb8`, while the PR source head is `be8b96bb7d5448125d0c4134fb6275f02950ff53`. This evidence verifies the isolated candidate and the tested unregistered-adapter path, not hosted Development parity, a real provider, or universal Mission Authority enforcement.

## Safe next acceptance sequence

1. Keep the provider registry empty and hosted Research blocked.
2. Extend and reconcile the existing source-level outbound-effect inventory against every reachable external side-effect entry point; mark each as mediated by the reviewed JIT gateway or explicitly outside Mission Action scope. Record that the current inventory is not a transitive network trace.
3. Add exact tests for each Issue #23 acceptance item that is not already tied to a named regression test; include changed destination/input/action, stale/revoked authority, missing approval, cross-tenant denial, and provider/model replacement without authority expansion.
4. Review the ordered W66–W79 rollout and rollback/recovery plan. The current hosted Development ledger was last verified at W65; no hosted migrations are authorized by this audit.
5. Only after a concrete provider adapter is reviewed and every entry point is proven to route through the gateway should Issue #23 be considered for closure. Live provider tests require separate explicit authorization and a preview-only environment.

## Safety boundaries

No hosted database change, live Research, real provider dispatch, production promotion, DNS/billing change, Git `main` change, or PR merge was performed for this audit. PR #29 remains OPEN / Draft / UNMERGED. Production launch remains **NOT APPROVED**.

## Follow-up validation — 2026-10-13 (code/test SHA `4f80362e276cdd9623b2d7485bbacdcc656374db`)

The internal Mission Action worker now has a **runtime HTTP fail-closed smoke check** in the disposable local E2E setup, in addition to the injected worker-boundary unit tests and static route-ordering assertions.

- The test starts the application only against the verified disposable Supabase stack, sends an authenticated loopback HTTP `POST` to `/api/internal/agent-executions/{executionId}` with a fresh worker token and a randomly generated, unregistered `audience`, and requires HTTP **503** with the exact no-reviewed-adapter response.
- The setup refuses non-loopback targets before making the request. The token remains server-side and is not passed to Playwright or browser state.
- The existing runtime unit regression verifies that a missing/mismatched adapter cannot create the privileged client or invoke dispatch/reconciliation. Together, these tests prove the specific unregistered-adapter deny path, not all possible route paths or universal external-effect enforcement.
- Web Unit **328/328 PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38369165964
- Web CI / TypeScript / production build **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38369165944
- Flutter CI **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38369165997
- W25 isolated PostgreSQL atomic fence **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38369165962
- W21 Local Launch Gate **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38369165919 — all 25 job steps succeeded, including disposable PostgreSQL 17/pgTAP, Mission Authority regressions, concurrency races, fake-provider gateway integration, both browser E2E tests, stack teardown, cleanup verification, and evidence uploads.
- W21 evidence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38369165919/artifacts/11798412271
- W21 browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38369165919/artifacts/11798422262
- Netlify Deploy Preview is **READY** and the branch preview verification check is green: https://deploy-preview-29--unique-kringle-3ce321.netlify.app

This does **not** change the decision for Issue #23: all external side effects still are not proven to pass through the Mission Authority JIT gateway, the provider registry remains intentionally empty, and no real provider adapter is certified. Hosted Development schema parity and other external release gates remain unverified. PR #29 stays OPEN / Draft / UNMERGED.

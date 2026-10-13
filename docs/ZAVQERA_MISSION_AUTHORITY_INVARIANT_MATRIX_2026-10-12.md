# ZAVQERA Mission Authority invariant matrix — 2026-10-12

**Reviewed branch:** `zavqera/ai-planner-integration`  
**Reviewed PR:** #29, OPEN / Draft / UNMERGED  
**Latest code/test head verified:** `4f80362e276cdd9623b2d7485bbacdcc656374db`  
**Latest code/test evidence:** W21 and companion gates passed on code/test SHA `4f80362e276cdd9623b2d7485bbacdcc656374db`; the later documentation-only commit in this follow-up does not change application or test code. This matrix is a source and evidence audit, not a claim of universal production enforcement.

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
| Cross-tenant denial / role and approval scope | **Partial; separate-workspace approval request, decision and execution-start denials explicitly covered** | `supabase/tests/w69_agent_execution_dispatch_claim.sql` gives the attacker ownership of a separate workspace, confirms access to their own workspace but not the target, and requires: `public.request_mission_approval` → `MISSION_NOT_FOUND_OR_FORBIDDEN`; `public.decide_mission_approval` against a real pending target-workspace approval → `APPROVAL_NOT_FOUND_OR_FORBIDDEN`; `public.start_agent_execution` → `MISSION_NOT_FOUND_OR_FORBIDDEN`. It also checks `authenticated_claim_denied`; W57 covers exact action/agent binding and generic approval rejection. | Passing these isolated SQL cases still does not establish complete role coverage or universal isolation for every protected route. Continue the broader entry-point audit; Issue #23 remains open. |
| All external side effects pass through this gateway | **Missing / not proven** | `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs` explicitly states no route currently wires a real provider; `provider-adapter-registry.mjs` is intentionally empty. The internal route is fail-closed until reviewed adapter registration. | This is the central blocker for the universal enforcement claim. Before any provider is enabled, enumerate side-effect entry points, prove they cannot bypass the gateway, review the concrete adapter, and add real-boundary contract tests. |
| Live Research with persisted citations/history, real email, password reset, manual visual QA | **External release gates not verified** | `docs/ZAVQERA_LAUNCH_GATES_STATUS.md`. | Separate authorized preview-only tests are required. These are not substitutes for the JIT gateway proof. |

## Exact automated evidence currently available

- W21 Local Launch Gate — PASS on code/test SHA `7a2e559d3f6c3a91b69bce387f2adf98c17ee3d7`: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544742
- W21 evidence/cleanup artifact: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544742/artifacts/11764643205
- W21 browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544742/artifacts/11764364237
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544756
- Web CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544739
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544914
- W25 isolated PostgreSQL atomic fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544646
- Netlify workflow: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544695 (preview verification succeeded; deployment and live-provider checks were skipped).

The W21 artifacts were recorded as available with SHA-256 hashes in the launch-gates status document; the ZIP contents were not unpacked for this matrix. Do not claim artifact internals beyond the workflow step summaries.

## Safe next acceptance sequence

1. Keep the provider registry empty and hosted Research blocked.
2. Complete a source-level inventory of every reachable external side-effect entry point and map each to either the reviewed JIT gateway or an explicit “no external side effect” classification.
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

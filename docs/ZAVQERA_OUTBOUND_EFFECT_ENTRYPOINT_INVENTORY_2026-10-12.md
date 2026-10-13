# ZAVQERA outbound-effect entry-point inventory — 2026-10-12

**Branch:** `zavqera/ai-planner-integration`  
**PR #29:** OPEN / Draft / UNMERGED  
**Purpose:** source-level inventory supporting Issue #23. This is not a runtime/network trace and must not be described as proof that every external side effect is mediated by Mission Authority.  
**Latest PR HEAD (documentation):** `4b087c5bf42de46fdb650d1c1ac1459279b70dfa`. **Latest application/migration/test candidate:** `be8b96bb7d5448125d0c4134fb6275f02950ff53`. W21/W25, Web Unit, Web CI/build, Flutter CI and Netlify preview-route checks passed on the latest PR HEAD; exact links and scope limits are recorded in the Mission Authority invariant matrix.

## Inventory

| Entry point | Outbound effect | Existing controls | Mission Authority JIT status |
|---|---|---|---|
| `apps/web/app/api/ai/plan/route.ts` → `apps/web/lib/ai-planner.ts` | Calls OpenAI Responses API to draft a mission plan. | Authenticated route, plan/workspace checks, AI quota reservation and settlement via `apps/web/lib/ai-usage.ts`, provider outcome classification in `apps/web/lib/ai-generation-service.mjs`. Mock provider is not permitted in production runtime. | **Separate provider-cost operation, not a mission action dispatch.** No evidence that this planning call goes through the Mission Authority JIT gateway; do not use it as proof of external-action enforcement. |
| `apps/web/app/api/ai/plan/anonymous/route.ts` → `apps/web/lib/ai-planner.ts` | Calls OpenAI to produce an anonymous draft plan. | Anonymous usage reservation keyed to visitor/IP/request ID; production forces real provider mode; uncertain outcomes preserve the reservation to avoid blind retry after possible provider spend. | **Separate draft-generation operation.** It must not execute a mission action. It is not proof of the universal JIT action boundary. |
| `apps/web/lib/anonymous-ai-usage.ts` | Makes server-side `POST` requests to the configured Supabase project's `/rest/v1/rpc/{name}` endpoints: `reserve_anonymous_ai_generation`, `consume_anonymous_ai_generation`, and `release_anonymous_ai_generation`. | Requires `supabaseUrl` and server-only `ZAVQERA_SERVER_DB_KEY`; uses no-store requests and fails closed on missing configuration or invalid RPC results. | **Internal platform quota/ledger writes, not delegated mission-action dispatch.** This is a separate platform credential/RPC authorization boundary and is not a Mission Action provider-adapter call. |
| `apps/web/app/api/missions/[id]/research/route.ts` → `apps/web/lib/ai-research.ts` | Calls OpenAI for bounded, read-only mission research; also makes internal trusted-worker calls for schema preflight and trusted completion. | Authenticated mission access; active read-only agent check and `external_side_effects === false`; AI quota reservation; requester-bound execution; schema-signature preflight before provider spend; fail-closed handling of uncertain outcomes; W79 service-role-only trusted completion records `verified: false`. | **Bounded read-only research path, not permission to perform external actions.** Hosted Research remains NOT VERIFIED because hosted Development was last checked at W65 and does not have the W79 signature. Do not run it on hosted Development without separate authorization. |
| `apps/web/app/api/ai/diagnostics/route.ts` | Makes an authenticated/guarded GET request to `https://api.openai.com/v1/models/{model}` to check provider connectivity/model access. | Requires `OPENAI_API_KEY`; bounds model path via URL encoding; maps auth/model/service/connectivity outcomes to stable diagnostic codes. | **Provider diagnostic request, not a mission action.** It is still an outbound provider call and is outside the Mission Action JIT gateway. Keep it non-mutating and avoid treating it as evidence of mission-action authorization. |
| `apps/web/app/api/business/invitations/route.ts` | Sends workspace invitation email through `https://api.resend.com/emails`. | Authenticated route role checks; configuration required; token hash stored rather than raw token; expiry and invitation record; stable idempotency key; provider errors do not imply inbox delivery. Candidate W80 also changes the underlying SECURITY DEFINER create/revoke RPCs to fail closed when workspace-role lookup is NULL, with W44 cross-workspace regressions. | **A real external effect outside the Mission Action gateway.** It is a workspace-admin workflow, not a delegated mission action. Real inbox delivery remains NOT VERIFIED and requires a separate preview-only test. Candidate W80 passed the isolated PostgreSQL 17/pgTAP replay and W21 gate on the current PR update (https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206748). This does not prove hosted Development migration parity; no hosted migration was applied. |
| `apps/web/components/auth-form.tsx`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/auth/confirm/route.ts` | Browser auth flow invokes Supabase Auth `signUp`, `signInWithOAuth`, and `resetPasswordForEmail`; callback/confirm routes exchange a one-time PKCE `code` via `exchangeCodeForSession` or verify the supplied `token_hash` with `verifyOtp`. Supabase Auth may send confirmation/reset email. | Supabase Auth owns these identity-provider calls; callback routes perform the code exchange or OTP verification and then use the safe redirect path. | **Identity-provider effects, outside Mission Action JIT.** Real confirmation/reset email delivery and hosted callback verification remain NOT VERIFIED. These routes are not mission-action dispatch and must not be counted as JIT-boundary evidence. |
| `apps/web/app/api/auth/password-policy/route.ts` → `apps/web/lib/password-policy.mjs` | Checks a new or reset password against the external Pwned Passwords range API at `https://api.pwnedpasswords.com/range/{prefix}`. | SHA-1 is computed locally; only the first five uppercase hex characters are sent, and the remaining suffix is compared locally. Uses `Add-Padding: true`, a 5-second timeout, and returns HTTP 503 when the external check is unavailable. `apps/web/test/password-policy.test.mjs` verifies the range-prefix request and fail-closed outage behavior. | **Read-only security lookup outside Mission Action JIT.** The reviewed code does not send plaintext or the full password hash; it remains an external dependency that should be included in privacy and availability reviews. |
| `apps/web/app/api/internal/agent-executions/[executionId]/route.ts` | The only reviewed candidate route that can call the persistent dispatch/reconciliation gateway for mission execution. | Token-protected worker; exact operation/audience validation; `resolveTrustedDispatchAdapter`; fails with HTTP 503 before client construction/claim when no adapter exists; dispatch and reconciliation functions are distinct. | **Fail-closed; currently no real provider call is possible through the registry.** `apps/web/lib/mission-authority/provider-adapter-registry.mjs` intentionally exports an empty frozen registry. |
| `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs` | Performs the persisted JIT claim, then invokes an injected trusted adapter; reconciliation only calls provider lookup. | One-time claim; audience binding; immutable claim envelope; unknown outcome stays reconciliation-required; no blind dispatch retry; receipt correlation and fresh reconciliation evidence. | **Candidate seam with isolated fake-provider tests only.** The module comment explicitly says no route currently wires a real provider; this is not universal production enforcement. |
| `apps/web/app/api/agent-executions/[executionId]/route.ts` | Starts/records/cancels/retries execution state via guarded Supabase RPCs. | RPC boundary and status mapping; explicit conflicts for duplicate attempts, unknown outcome, retry creation and held budget. | **Execution state-control route, not provider I/O.** It must not be treated as the dispatch gateway. Verify its RPCs remain guarded in the migration/pgTAP suite. |

## What this inventory proves—and does not prove

- The branch has several intentional outbound integrations (AI planning, read-only research, Resend invitations, Supabase Auth and the Pwned Passwords password-range lookup) that are **not** Mission Action dispatches. They have their own authorization/quota/token controls, but they are not all governed by the Mission Authority JIT gateway.
- The actual mission-action worker route is fail-closed today because no trusted provider adapter is registered. This is the safe current state.
- The persistent gateway and SQL candidate controls have passing isolated tests on code/test SHA `706f7801c92f54feb9a55b77103c00c2e54f2d10`, including W21 run https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38291831848. W21 completed the PostgreSQL 17 replay/pgTAP, concurrency proofs, fake-provider integration, browser E2E, cleanup, and evidence upload. Fake-adapter success is not real-provider certification; artifact existence is verified but ZIP internals were not independently unpacked in this review.
- Hosted Development was last read-only verified at W65; W66–W79 remain absent from the hosted migration ledger. No hosted migration was applied as part of this inventory.
- The current source pass enumerated all 24 `apps/web/app/api/**/route.ts` route files on this branch and inspected the action, approval, execution, research, AI planning/diagnostics, invitation and member-management paths. The obvious external HTTP paths identified here are OpenAI plan generation, OpenAI diagnostics, OpenAI read-only research, Resend invitation email, Supabase Auth identity/email flows, and the Pwned Passwords range lookup from `lib/password-policy.mjs`; research also makes internal worker HTTP calls for schema preflight/completion. The password-policy helper sends only a five-character SHA-1 prefix and compares the suffix locally, with an explicit five-second timeout and fail-closed HTTP 503 behavior. This is a route/helper-level source inventory, not a transitive dependency/network trace; further transitive review remains open.

## Next acceptance actions

1. Keep the provider registry empty and the internal dispatch route fail-closed.
2. Search and review all reachable `fetch`, provider SDK, email, webhook, queue and callback call sites, including transitive helper modules, and add any newly found entry points to this inventory.
3. **Completed for the current no-adapter path on code/test SHA `4f80362e276cdd9623b2d7485bbacdcc656374db`:** the disposable full-loop E2E setup now sends a real authenticated HTTP request to the internal mission-action route with a fresh server-only worker token and a randomly unregistered `audience`; it requires the exact HTTP 503 no-adapter denial. Paired injected-boundary unit tests assert zero privileged-client creation and zero dispatch/reconciliation calls. This proves the missing-adapter deny path, not every route/path or a registered-provider side effect.
4. Add exact tests for changed action/input/destination, stale/revoked authority, missing approval, provider/model replacement without authority expansion, and cross-tenant denial.
5. Keep hosted migration rollout, live Research, Resend inbox delivery, password reset verification and real-provider adapter certification separately authorized.

## Safety

No hosted database was changed, no hosted Research or real mission provider call was executed, and no production deployment, DNS/billing change, Git `main` change, or PR merge occurred. Issue #23 remains OPEN and production readiness remains NOT APPROVED.


## Follow-up verification — documentation HEAD `a9df2e0c99ca9166bde8b82ba8ef7d34365c1ff0`

- W21 run `38292605062` completed **SUCCESS** on this documentation HEAD. All 21 job steps completed successfully, including browser E2E, disposable stack cleanup and cleanup verification, evidence creation, and both artifact uploads.
- Evidence artifact: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38292605062/artifacts/11766433934
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38292605062/artifacts/11766673146
- Other current-HEAD workflows also completed successfully: Web CI `38292605015`, Web Unit `38292605099`, Flutter CI `38292605130`, W25 `38292605098`; Netlify preview route verification `38292605008` passed with deployment skipped.
- Review of W57/W68/W69/W70 SQL tests confirms strong exact-scope, budget, one-time claim, reconciliation and stale-evidence assertions. W69 creates a second attacker-owned workspace and verifies that its owner cannot request an approval, decide/cancel a real pending approval, or start an execution in the target workspace; it positively confirms permission to edit the attacker's own workspace and rejects access to the target. This isolated cross-workspace regression supplements, but does not replace, the broader role/entry-point matrix. Other reviewed fixtures may still use a single workspace. This test evidence is not proof of universal authorization across every route.

- W44's cross-workspace revoke regression found that `public.revoke_workspace_invitation` was a SECURITY INVOKER wrapper calling a private function whose EXECUTE privilege is deliberately revoked from authenticated callers. W80 keeps public invitation RPCs SECURITY INVOKER and matches private-helper EXECUTE grants to each wrapper: token lookup is readable by anon/authenticated, while create/accept/revoke require authenticated; the helper implementations remain pinned SECURITY DEFINER. W44 asserts the complete matrix. W71 adds a behavior test that a separate workspace owner cannot reconcile an execution. An earlier W21 run on an intermediate commit passed Mission Authority but failed the broader workspace gate at that wrapper. The helper-grant/wrapper correction is included in PR code/test candidate `be8b96bb7d5448125d0c4134fb6275f02950ff53`, and the subsequent W21 run completed successfully: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38384206748.
- The internal mission-action route now has both source-order/unit assertions and a runtime loopback HTTP denial test for the unregistered-adapter path. Current W21 diagnostics record HTTP 503, `unregistered_adapter_denied`, and `providerCall=not_attempted`. This proves only that narrow path; it does not prove zero I/O or JIT mediation for all other side-effect entry points.
- No code changes were made during this audit pass. Code/test HEAD remains `706f7801c92f54feb9a55b77103c00c2e54f2d10`; this follow-up is documentation only. Do not conflate the passing current-head CI with hosted Development migration parity or real-provider certification.

## Runtime route verification — 2026-10-13 (code/test SHA `4f80362e276cdd9623b2d7485bbacdcc656374db`)

The dynamic route-level check previously listed as outstanding is now present for the **unregistered-adapter fail-closed path**:

1. The disposable E2E setup starts the app against a freshly reset local PostgreSQL 17/Supabase stack, verifies the configured backend is not hosted Development, and then sends a token-authenticated `POST` over loopback to the real internal mission-action route.
2. The request uses a randomly generated execution UUID and an `audience` that is randomly generated per run and is not registered in the intentionally empty trusted adapter registry.
3. The check requires HTTP 503 and the exact response `No reviewed provider adapter is registered. No provider call occurred.`; unexpected success, other status, wrong response, non-loopback base URL, or absent response fails the E2E setup.
4. The worker-boundary unit tests separately assert that missing/mismatched adapters and invalid operations do not construct the privileged client and do not call dispatch/reconciliation.
5. W21 on this code/test SHA passed all 25 steps, including browser E2E, disposal cleanup, cleanup verification and both artifact uploads: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38369165919

This check is intentionally narrow. It does not register a provider, make a real outbound provider request, or prove that all external side effects in the product are mediated by Mission Authority. The provider registry remains empty and the universal-boundary acceptance criterion in Issue #23 remains open.

## Additional shared-helper finding — 2026-10-13

A follow-up review of shared helpers found one more external HTTP call that was not in the original route-only list: the password-compromise range lookup in `apps/web/lib/password-policy.mjs`, invoked from `apps/web/app/api/auth/password-policy/route.ts` by the sign-up and reset-password flows. This row now records what is sent and its failure behavior. The request is not a Mission Action; do not treat its presence as a JIT-gateway bypass.

Evidence: `apps/web/test/password-policy.test.mjs` asserts the URL contains only a five-character SHA-1 prefix, padding is enabled, a matched suffix denies a password, and the helper fails closed when the external check is unavailable. This review covers the selected application routes and shared helpers examined on code/test SHA `4f80362e276cdd9623b2d7485bbacdcc656374db`; it is not a claim of a complete transitive dependency/network trace.


## Expanded source scan — 2026-10-13 — PR head `2a5fa41852fb8e30e5e74a2b74294a0bda080508`

The following source sweep was performed against PR branch HEAD `2a5fa41852fb8e30e5e74a2b74294a0bda080508`. That commit only changed launch-gate documentation; the application/source candidate remains the code already tested by the W21/W25 and web CI gates.

### Scope of the review

- All **24** files under `apps/web/app/api/**/route.ts`.
- All **36** TypeScript/JavaScript modules under `apps/web/lib/`.
- All **49** non-test TypeScript/JavaScript source/config files under `apps/web/` outside `apps/web/app/api/**` and `apps/web/lib/**`, including app pages, components, auth callbacks, middleware and configuration files.
- Searched direct fetch calls, absolute endpoint URLs, known provider identifiers, Supabase Auth/RPC invocations, and mission-worker/gateway call sites. The exact route and shared-helper inventory above remains the authoritative per-entry description.

### Outbound paths confirmed

1. **OpenAI planning:** `apps/web/app/api/ai/plan/route.ts` and `apps/web/app/api/ai/plan/anonymous/route.ts` call `apps/web/lib/ai-planner.ts`, which sends a Responses API request to `https://api.openai.com/v1/responses`. This is mission drafting and provider-cost usage, not a mission-action dispatch.
2. **OpenAI read-only Research:** `apps/web/app/api/missions/[id]/research/route.ts` uses the read-only Research helper `apps/web/lib/ai-research.ts` for its Responses API request. The route also uses two internal trusted-worker HTTP calls for schema preflight/completion. This is bounded read-only Research, not authorization to perform mission side effects; the hosted path remains blocked pending W66–W80 rollout and postchecks.
3. **OpenAI diagnostics:** `apps/web/app/api/ai/diagnostics/route.ts` calls `https://api.openai.com/v1/models/{model}` to test connectivity/model access. It is a diagnostic read, not a mission action.
4. **Resend invitations:** `apps/web/app/api/business/invitations/route.ts` posts to `https://api.resend.com/emails`. This workspace-admin email effect is outside the Mission Action gateway; real inbox delivery remains unverified.
5. **Password-compromise range lookup:** `apps/web/lib/password-policy.mjs` calls `https://api.pwnedpasswords.com/range/{prefix}`; the inspected code computes SHA-1 locally and sends only the first five hex characters, with the remainder compared locally. It is a read-only security lookup, not a delegated mission action.
6. **Supabase Auth identity flows:** `apps/web/components/auth-form.tsx` uses the Supabase browser Auth SDK for sign-in, sign-up, OAuth, password-reset email, password update, and sign-out; `apps/web/app/auth/callback/route.ts` exchanges/verifies Auth callbacks. These identity-provider effects have their own identity/session contract, not Mission Action dispatch.
7. **Supabase platform calls:** `apps/web/lib/anonymous-ai-usage.ts` makes REST RPC requests to the configured Supabase project for quota accounting. Route-handler `supabase.rpc(...)` calls and client-facing `fetch("/api/...")` calls target this application's own data/API layer, not third-party mission-effect providers.
8. **Mission Action gateway:** `apps/web/app/api/internal/agent-executions/[executionId]/route.ts` is the reviewed worker route; `persistent-dispatch-gateway.mjs` and `controlled-adapter.mjs` do not themselves make an HTTP provider request, and `provider-adapter-registry.mjs` remains intentionally empty. The missing-adapter path is dynamically verified by W21 as HTTP 503, `unregistered_adapter_denied`, `providerCall=not_attempted`.

### Scope limitation / decision

This sweep did not find an additional direct third-party HTTP provider call in the reviewed application routes, libraries, pages, or components beyond the entries already listed above. It is still a **source-level pattern audit**, not a complete transitive dependency analysis, instrumented runtime network trace, provider certification, or proof that every future or indirect effect is mediated by Mission Authority. In particular, the OpenAI draft/research/diagnostic calls, Resend email, Supabase Auth, and Pwned Passwords are deliberately classified as platform/service operations outside the Mission Action gateway; that classification must not be used to claim they are governed by mission authority.

The central Issue #23 requirement remains **NOT PROVEN**: the code currently has no reviewed real provider adapter, so no real mission-action integration is enabled. Keep the registry empty until the exact mission-action boundary and provider adapter receive their own review and acceptance tests. Hosted Development, Supabase Main/Production and production deployment were not changed by this source review.


## Follow-up route-source recheck — 2026-10-13 — PR HEAD `0fb82b31da401093ac992a30da1ddd1c507e1177`

Reviewed the 24 `apps/web/app/api/**/route.ts` handlers listed by the repository tree, plus `apps/web/app/auth/callback/route.ts`, `apps/web/app/auth/confirm/route.ts`, `apps/web/components/auth-form.tsx`, `apps/web/middleware.ts`, and the selected AI, password-policy and Mission Authority helper modules. This follow-up made one inventory clarification: callback and confirm routes themselves invoke Supabase Auth `exchangeCodeForSession` / `verifyOtp`; they are now explicitly named in the identity-provider row above.

No additional direct third-party REST destinations were identified in this bounded source scan beyond the existing inventory categories (OpenAI Responses/model diagnostics, Resend email and Pwned Passwords range lookup). Supabase SDK/database and Auth calls remain external service interactions. This was a source-pattern review, not a complete transitive dependency analysis or an instrumented runtime network trace; do not treat a no-new-destination finding as proof of universal JIT mediation.

The current-head W21/W25, Web Unit, Web CI/build, Flutter CI and Netlify preview-route workflow runs were successful; see PR comment dated 2026-10-13 for exact run/artifact links. No hosted database, provider registry, or deployment was changed by this documentation audit.


## Exact PR-head verification — 2026-10-13 — PR HEAD 4b087c5bf42de46fdb650d1c1ac1459279b70dfa

This is a documentation-only head after the W80 fail-closed candidate be8b96bb7d5448125d0c4134fb6275f02950ff53. The latest source inventory also includes Supabase Auth callback/email effects.

Fresh GitHub Actions runs associated with this PR HEAD all completed SUCCESS:
- W21 Local Launch Gate: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987591
- W25 Isolated PostgreSQL Atomic Fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987978
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987795
- Web CI/build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987777
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987603
- Netlify preview-route check: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987805 (workflow succeeded; deployment step skipped because this update is docs-only).

W21 evidence artifact: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987591/artifacts/11811144271  
W21 browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987591/artifacts/11811324410

The evidence artifact was downloaded and inspected. It records result=success, migration_source=repo-migrations, postgres_major=17, cleanup_attempted=true, supabase_stop_exit_code=0, remaining_containers=none, remaining_volumes=none, and cleanup_verified=true. The artifact's internal git_sha=700721117992d4766d8a4e395793c65d1d8b8d87 is the integration checkout SHA used inside the run; GitHub associates this workflow run with PR HEAD 4b087c5bf42de46fdb650d1c1ac1459279b70dfa.

Browser diagnostics report missionActionWorkerRoute=FAIL_CLOSED_VERIFIED, httpStatus=503, outcome=unregistered_adapter_denied, and providerCall=not_attempted. Both isolated browser E2E tests passed (2 passed), with cleanup verified and no container/volume remaining for the disposable project.

This evidence is scoped to isolated PostgreSQL 17, pgTAP, browser E2E, and fake-provider integration. It does not prove hosted Development migration parity, real-provider delivery, or universal Mission Authority enforcement across every outbound effect. Keep Issue #23 OPEN, provider registry empty, PR #29 OPEN/Draft/UNMERGED, and production readiness NOT APPROVED. No hosted Supabase migration or production deployment was performed.


---

## Superseding static boundary scan — 2026-10-13 — tested source SHA `346ffa0a8ecf26caaa9f8849cfda7604cc7cb750`

The 24 API `route.ts` files were reviewed for direct outbound URLs/calls and Mission Action gateway references. Mission/action CRUD, approval, verification, outcome, execution state-control, notification, usage, product-event and status handlers do not directly import/call the persistent Mission Action dispatch/reconciliation gateway or make direct third-party HTTP calls in the reviewed route source. Direct outbound operations already inventoried remain separate paths: OpenAI planning, read-only Research, model diagnostics, Resend invitations, Supabase Auth identity flows and the Pwned Passwords range lookup. They have their own controls and are not evidence of Mission Action JIT enforcement.

A new regression recursively scans API route source and asserts that direct imports/references of `persistent-dispatch-gateway.mjs`, `mission-action-worker-boundary.mjs`, `provider-adapter-registry.mjs`, and their key entry functions occur only in `/api/internal/agent-executions/[executionId]`. Further injected-unit tests check missing/wrong/incomplete adapters and unsupported operations fail before privileged-client creation or provider callback. Web Unit: 332/332 passed; W21 browser E2E: 2 passed; W21 diagnostics show the unregistered adapter path denied with HTTP 503 and `providerCall=not_attempted`.

**Scope limitation:** source scanning direct imports/fetches is not a transitive dependency/call-graph audit or network trace. A helper imported indirectly could still need review. Therefore universal mediation of every relevant external side effect remains **NOT PROVEN**. Keep Issue #23 open and the adapter registry empty.

Exact-head evidence:
- W21: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189778
- W21 evidence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189778/artifacts/11815317355
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189778/artifacts/11815317354
- W25: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189649
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189698
- Web CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189422
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189585
- Netlify: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189602

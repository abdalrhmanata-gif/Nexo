# ZAVQERA / NEXO — Handoff checkpoint
Checkpoint date: 2026-10-13 (Europe/Oslo). Use this as the handoff snapshot; re-verify live GitHub state before any new write.

## 1. Current source of truth
- Repository: https://github.com/abdalrhmanata-gif/Nexo
- Branch: zavqera/ai-planner-integration
- PR #29 base: zavqera/alternative-web-deployment
- PR #29: https://github.com/abdalrhmanata-gif/Nexo/pull/29 — OPEN / Draft / UNMERGED. Do not mark Ready, close, or merge without explicit authorization.
- Issue #23: https://github.com/abdalrhmanata-gif/Nexo/issues/23 — OPEN. Title: Implement and prove the Mission Authority JIT enforcement boundary. Do not close it yet.
- Latest PR HEAD at checkpoint: 4b087c5bf42de46fdb650d1c1ac1459279b70dfa. This is a documentation-only commit about Supabase Auth callback/email effects.
- Latest application/migration/test candidate: be8b96bb7d5448125d0c4134fb6275f02950ff53. Later commits since then are documentation-only.
- Deployment platform is Netlify, not Vercel. Preview: https://deploy-preview-29--unique-kringle-3ce321.netlify.app. The user explicitly asked not to send Vercel advice or status unless asked.

## 2. Exact current-head verification (2026-10-13)
All six workflows associated with PR HEAD 4b087c5bf42de46fdb650d1c1ac1459279b70dfa completed successfully:
- W21 Local Launch Gate: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987591
- W25 Isolated PostgreSQL Atomic Fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987978
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987795
- Web CI/build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987777
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987603
- Netlify preview-route workflow: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987805. Workflow succeeded; actual deploy was skipped because the change was docs-only.

W21 evidence/cleanup artifact: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987591/artifacts/11811144271  
W21 browser diagnostics artifact: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987591/artifacts/11811324410  
W21 job: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38393987591/jobs/115284467602

Both ZIP artifacts were downloaded and inspected. Evidence reports success, repository migrations replayed, PostgreSQL 17, cleanup attempted, stop exit code zero, no remaining containers or volumes, and cleanup_verified=true. Its internal git_sha is 700721117992d4766d8a4e395793c65d1d8b8d87, the integration checkout SHA inside the workflow; GitHub associates the run with PR HEAD 4b087c5bf42de46fdb650d1c1ac1459279b70dfa.

Browser diagnostics: missionActionWorkerRoute=FAIL_CLOSED_VERIFIED, httpStatus=503, outcome=unregistered_adapter_denied, providerCall=not_attempted. Both isolated browser E2E tests passed (2 passed). No hosted environment was targeted.

## 3. W80 hardening: what changed
Migration: supabase/migrations/20261013100000_w80_fail_closed_workspace_role_checks.sql.

A SQL NULL role-check bug was identified: guards like private.workspace_role(...) NOT IN (...) can evaluate to NULL for a non-member. In PL/pgSQL, IF NULL does not enter the denial branch. W80 adds explicit fail-closed checks, including coalesce(..., false) for private.can_edit_workspace, and guards approval decisions, invitation create/revoke, stale execution recovery, and authority-budget configure/revoke. It preserves workspace-activity audit writes and the W78 trusted history boundary.

Relevant tests:
- supabase/tests/w44_workspace_invitations.sql: cross-workspace invitation cases; public wrappers remain SECURITY INVOKER; private helpers are SECURITY DEFINER with pinned paths and correct EXECUTE grants; anon cannot create/accept/revoke.
- supabase/tests/w69_agent_execution_dispatch_claim.sql: cross-workspace denial and no state/history mutation; outsider can_edit_workspace is false.
- supabase/tests/w71_expired_external_execution_budget_recovery.sql: an owner from another workspace cannot reconcile the target stale execution.
- supabase/tests/w73_trusted_system_mission_events.sql: missing-role guard in trusted recovery.
Public invitation RPC wrappers must remain SECURITY INVOKER under W30/W51 repo invariants. Do not change public wrappers to SECURITY DEFINER just to make a test pass.

W21 includes disposable PostgreSQL 17 migration replay/pgTAP, Mission Authority security tests, AI quota/plan/workspace security tests, concurrent idempotency, atomic budget race, one-time dispatch claim/reconciliation race, W72 persistent gateway integration with fake providers, full browser E2E, teardown and cleanup verification.

## 4. Mission Authority status
ZAVQERA is a provider-neutral Mission Delegation Layer. A Mission binds goal, allowed/disallowed actions, budget, expiry, approvals and verifiable outcomes. Core concepts: Principal, Intent, Mission, Authority, Policy, Agent, Action, Evidence, Verification, Outcome. Authorization must be checked server-side immediately before a side effect; a model response, client check or invocation envelope is not authority.

Relevant source:
- apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs — candidate provider-neutral persistent JIT dispatch/reconciliation seam.
- apps/web/lib/mission-authority/controlled-adapter.mjs — adapter interface.
- apps/web/lib/mission-authority/provider-adapter-registry.mjs — intentionally empty frozen registry.
- apps/web/app/api/internal/agent-executions/[executionId]/route.ts — fails closed before privileged client/claim when no reviewed adapter exists; runtime test proves HTTP 503/no provider call for the unregistered adapter path.
- W57/W68/W69 plus W70/W74/W75/W76/W79 migrations/tests cover parts of approval binding, budget, claims, unknown-outcome reconciliation, receipt correlation, trusted events and research completion. W80 handles null-role fail-closed hardening.

The outbound-effect inventory now includes OpenAI authenticated and anonymous planning spend; read-only Mission Research and trusted-worker calls; OpenAI model diagnostics; Resend invitation email; Supabase Auth sign-up/OAuth/password-reset/callback email; Pwned Passwords range-prefix lookup; the internal mission-execution worker route; and the separate mission-execution state-control route. This is a source-level inventory, not a transitive network trace. Separate identity/invitation/planning effects should be classified separately from mission action execution.

Critical limitation: the provider registry remains empty and no route wires a real provider. Tests use fake providers and cover the specific fail-closed path. Universal Mission Authority enforcement over every outbound effect remains NOT PROVEN. Issue #23 must stay OPEN.

## 5. Remaining release blockers
1. Hosted Supabase Development migration parity is NOT VERIFIED. Last recorded read-only inventory was at W65; W79 trusted-completion signature was absent from that hosted snapshot. W80 is repository candidate code and was not applied to hosted Development. Recheck current ledger read-only if authorized; do not apply migrations as part of this continuation.
2. Authenticated live/hosted Mission Research, citations and durable history remain NOT VERIFIED.
3. Real Resend invite inbox delivery remains NOT VERIFIED. Any authorized test must use Netlify Deploy Preview context, a verified sending domain and private secrets; API acceptance is not proof of inbox delivery.
4. Supabase Auth confirmation/password-reset email and callback live verification remain NOT VERIFIED.
5. Last recorded Development Auth Security Advisor: auth_leaked_password_protection WARN/Disabled.
6. Manual desktop/mobile visual QA is not recorded.
7. No reviewed real provider adapter exists; keep registry empty pending threat review, narrow scopes and reconciliation contract.

## 6. Non-negotiable safety boundaries
- Never modify Git main, Supabase Main/Production, hosted Development schema, DNS, billing, or production deployment during this continuation.
- No live Research, real Resend email or real provider side effect without separate explicit authorization and secrets configured privately. Never paste secrets into chat/comments.
- Never add a real provider just to make tests green.
- Fake-provider tests do not certify a real provider.
- Keep PR #29 OPEN/Draft/UNMERGED and Issue #23 OPEN.
- User prefers concise Arabic updates and concrete work; do not re-ask questions already answered.
- Use Netlify; do not raise Vercel unless explicitly asked.

## 7. Product context to preserve
- Product name ZAVQERA; repository originated as NEXO.
- Design goals: provider/storage/queue/worker agnostic, API-first, modular, multi-tenant-ready; core domain must not depend on Flutter, Supabase, PostgreSQL, or OpenAI.
- Positioning: mission-level delegation and authority layer, not a general assistant or direct head-on competitor to Google/Microsoft/OpenAI.
- Personal and Business experiences share one core. Workspace roles Owner/Admin/Member/Viewer; approvals Pending/Approved/Rejected/Cancelled; Agent Registry and a read-only ZAVQERA Research Agent; Business Control Center; notifications linking directly to missions/approvals; mission templates and share links.
- Mission planner has Boundaries and permissions; those limits are persisted and sent to the planner but are not themselves proof of JIT enforcement.
- Localization: English, Norwegian, Arabic, Spanish, French, German. Some dynamic backend details may fall back to English.
- In-app notifications are not push delivery and not a complete persistent read/unread event system.
- Resend invitation implementation exists but inbox delivery remains unverified.
- Pricing discussed but not finalized: Free 5 missions, Plus around $9 for 50 missions, Pro around $25 for 300 missions. These are hypotheses, not approved launch pricing.
- Development project remembered: Supabase ID mrwmmbytcymqgwvcoywd, region eu-west-1, PostgreSQL 17, previously ACTIVE_HEALTHY. Keep Supabase Main/Production untouched.

## 8. Next execution sequence
1. Recheck live PR HEAD and workflow states before writes; branch can advance via doc commits.
2. Read this checkpoint and the live docs:
   - docs/ZAVQERA_MISSION_AUTHORITY_INVARIANT_MATRIX_2026-10-12.md
   - docs/ZAVQERA_OUTBOUND_EFFECT_ENTRYPOINT_INVENTORY_2026-10-12.md
   - docs/ZAVQERA_LAUNCH_GATES_STATUS.md
3. Continue source-level outbound-effect review; identify exact Issue #23 gaps and write narrow tests. Do not claim a complete transitive trace.
4. Preserve empty provider registry and fail-closed behavior. No new schema/RPC without source/schema justification and a separately reviewed migration.
5. After every branch commit, recheck exact-head CI; if failed, inspect logs and fix only the concrete failing issue.
6. Hosted/live release gates need separate authorization and private configuration. Production readiness remains NOT APPROVED.

## 9. New conversation prompt
استأنف مشروع ZAVQERA/NEXO من ملف التسليم docs/ZAVQERA_HANDOFF_2026-10-13_AR.md على فرع zavqera/ai-planner-integration. أعد التحقق من HEAD وPR #29 وIssue #23 وحالة workflows لأن الفرع قد يتقدم. HEAD عند التسليم هو 4b087c5bf42de46fdb650d1c1ac1459279b70dfa، وآخر كود/SQL candidate هو be8b96bb7d5448125d0c4134fb6275f02950ff53. كانت W21/W25/Web Unit/Web CI/Flutter/Netlify كلها SUCCESS على HEAD المحفوظ. واصل العمل الفعلي على تدقيق Mission Authority ومداخل التأثيرات الخارجية. أبقِ PR #29 مفتوحًا Draft وغير مدموج، وIssue #23 مفتوحة، وسجل adapters فارغًا. لا تغيّر Supabase Development أو Main/Production أو DNS أو billing أو الإنتاج، ولا تستخدم Vercel. لا تعِد الأسئلة السابقة؛ نفّذ ما يمكن بأمان ووثّق كل نتيجة.


## Superseding verified checkpoint — 2026-10-13, 13:03 UTC

This addendum supersedes the earlier pending-run snapshot above. Recheck GitHub again before any later write.

- **Exact tested PR source HEAD:** `346ffa0a8ecf26caaa9f8849cfda7604cc7cb750`.
- **PR #29:** OPEN / Draft / UNMERGED. **Issue #23:** OPEN.
- The application/SQL candidate remains `be8b96bb7d5448125d0c4134fb6275f02950ff53`; the additional commits after the prior checkpoint touched only `apps/web/test/mission-authority-worker-auth.test.mjs`. No application or SQL migration changed in this hardening pass.
- All six gates passed on this exact tested HEAD:
  - W21: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189778
  - W25: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189649
  - Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189698 — 332 tests passed, 0 failed
  - Web CI/build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189422
  - Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189585
  - Netlify Preview verification: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189602
- W21 evidence artifact: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189778/artifacts/11815317355. It records `result=success`, repository migrations replayed on PostgreSQL 17, disposable Supabase stop exit code 0, no remaining labeled containers or volumes, and `cleanup_verified=true`.
- W21 browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38401189778/artifacts/11815317354. Browser E2E **2 passed (2.5m)**; unregistered adapter denied with HTTP 503, `unregistered_adapter_denied`, and `providerCall=not_attempted`.

### Additional Mission Authority worker-boundary regressions

The existing test file now:
1. Recursively scans all 24 API route source files and asserts that direct imports/references to the persistent dispatch gateway, the injected worker boundary, and the trusted adapter registry occur only in the trusted internal execution route.
2. Covers missing adapter, wrong audience, missing dispatch implementation, and missing reconciliation implementation; every denied case asserts no privileged client creation and no dispatch/reconciliation callback.
3. Verifies the accepted test-double order is adapter resolution → client creation → dispatch.
4. Verifies an unsupported operation is rejected before adapter resolution or privileged client creation.

These are source-layout and injected-unit tests plus the W21 fake-provider/disposable-browser evidence. They do **not** constitute a transitive dependency audit, full network trace, real-provider certification, or proof of universal enforcement. Keep the provider registry empty and Issue #23 open.

### Unchanged release blockers and guardrails

The last documented read-only hosted Development migration inventory is W65; W66–W80 are still NOT APPLIED. Hosted Research remains blocked. Real Research with persisted citations/history, real invitation/password-reset email verification, manual visual QA, leaked-password protection, a reviewed real adapter, and universal JIT mediation remain NOT VERIFIED. No hosted schema/data changes, Main/Production changes, DNS/billing changes, production promotion, or real-provider side effect was performed.

Next safe work: continue the bounded source-level audit and narrow regression coverage. Any hosted schema rollout, live Research test, real email, or provider adapter still requires its own explicit authorization and private configuration.


## Superseding exact-head checkpoint — 2026-10-13 — PR source HEAD `503f87e3d8a00bdec0f1983ea665f8097cb3d417`

This entry supersedes earlier pending-run snapshots in this file. Refresh GitHub before any subsequent write.

**Current code/test head:** `503f87e3d8a00bdec0f1983ea665f8097cb3d417`; relative to the prior docs checkpoint `bd915ee9b82339f882a6a28a6ced93f24a0c941d`, the only changed file is `apps/web/test/mission-authority-worker-auth.test.mjs` (transitive local-import boundary guard). The application and SQL candidate remains `be8b96bb7d5448125d0c4134fb6275f02950ff53`.

**All six workflows are green on this exact PR source HEAD:**
- W21 Local Launch Gate: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38403622247
- W25 Isolated PostgreSQL Atomic Fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38403622216
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38403622157 — **333 passed, 0 failed**
- Web CI / typecheck / production build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38403622166
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38403622202
- Netlify preview-route verification: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38403622197 — succeeded; this is not proof of a production promotion or live Research completion.

**W21 artifacts were downloaded and their contents inspected:**
- Evidence and cleanup: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38403622247/artifacts/11817251474 — `result=success`, repository migrations, PostgreSQL 17, disposable project `zavqera-e2e-local`, `supabase_stop_exit_code=0`, `remaining_containers=none`, `remaining_volumes=none`, `cleanup_verified=true`.
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38403622247/artifacts/11816816711 — preflight READY; unregistered adapter denied as HTTP 503 / `unregistered_adapter_denied` / `providerCall=not_attempted`; Browser E2E **2 passed (2.7m)**; cleanup VERIFIED.

**Synthetic GitHub merge-SHA precision:** the W21 artifact records `git_sha=c01172831c716712ab6e816970f3e2624c4dad07`, which is GitHub’s synthetic PR merge commit. Its parents are base `46dc6029f084fb000ba511478d6e8aec3eb532b3` and PR head `503f87e3d8a00bdec0f1983ea665f8097cb3d417`. This is the expected merge-test checkout; the PR branch head is still `503f87e…`.

### New transitive static-import guard

A recursive test now follows statically declared local imports from all API route files (relative imports, the `@/` source alias and recognized source extensions) and asserts that only the trusted internal execution route reaches the Mission Action dispatch gateway / worker boundary / trusted registry. The test passed as case 183 in the 333-test Web Unit run. Existing injected worker tests cover absent/wrong/incomplete adapter contracts and invalid operations before privileged-client creation, and the valid resolution→client→dispatch order.

**Scope limits remain explicit:** this is a bounded static traversal of local, statically declared imports. It does not analyze computed/dynamic imports, package internals, generated/bundled call graphs, runtime network traffic, or every non-Mission-Action outbound operation. It is not universal JIT enforcement proof. Provider registry remains empty and Issue #23 stays open.

### Unchanged release blockers / guardrails

PR #29 is OPEN / Draft / UNMERGED; Issue #23 is OPEN. Last documented hosted Development migration inventory remains W65; W66–W80 are NOT APPLIED, so hosted Research stays blocked. Real Research persistence/citations, real email delivery and password-reset verification, manual visual QA, leaked-password protection, and real-provider adapter certification remain NOT VERIFIED. No hosted DB writes, Main/Production changes, DNS/billing changes, real provider side effects or production deployment were performed.


## Superseding checkpoint — 2026-10-13 — current code/test HEAD `10dac572cd672c789cddcf891b51cdcce17b1f73`

This section supersedes the previous pending-run notes. Exact PR head and workflow metadata were rechecked before recording.

### Reconciliation-claim validation hardening
The persistent gateway now validates the reconciliation claim's source-time binding **before calling adapter.reconcile**. A claim is rejected as `INVALID_RECONCILIATION_CLAIM_RECORD` when its dispatch bound (`dispatch_claimed_at`, falling back to `created_at`) is missing/invalid, when its reconciliation timestamp is missing/invalid, when the claim predates the dispatch bound, or when the claim/lease interval is invalid or expired. The adapter lookup is not called in these malformed-claim cases.

A table-driven test contains 18 malformed/unbound reconciliation scenarios and asserts `RECONCILE_REQUIRED`, `providerLookupPerformed=false`, `persisted=false`, zero adapter calls and no finalization RPC. Web Unit passed **335 tests / 0 failures**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407192895

The SQL comparison is consistent with the application guard: W70/W74 return the complete `agent_executions` row from `claim_agent_execution_reconciliation`; trusted completion requires provider evidence newer than `coalesce(dispatch_claimed_at, created_at)`, newer than the current `reconciliation_claimed_at`, and a valid current, unexpired claim token. No SQL migration or hosted database was changed in this fix.

### Exact-head gates and artifacts
All six gates passed on source HEAD `10dac572cd672c789cddcf891b51cdcce17b1f73`:
- W21 Local Launch Gate: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407193288
- W25 Isolated PostgreSQL Atomic Fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407194176
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407192895 — 335 passed, 0 failed
- Web CI / production build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407193049
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407194147
- Netlify preview-route verification: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407194404 — succeeded; this does not claim production promotion or live Research verification.

W21 artifacts were downloaded and inspected:
- Evidence/cleanup: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407193288/artifacts/11820075267 — result success, repository migrations replayed on PostgreSQL 17, disposable Supabase stop exit code 0, no remaining labeled containers/volumes, `cleanup_verified=true`.
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38407193288/artifacts/11820205143 — no-adapter worker path HTTP 503 / `unregistered_adapter_denied` / `providerCall=not_attempted`; Browser E2E 2 passed (2.0m), cleanup verified.

W21's recorded `git_sha=3297661185557c924774d6efbaae33305b2ed999` is the synthetic GitHub merge-test commit. It must be distinguished from PR source HEAD `10dac572cd672c789cddcf891b51cdcce17b1f73`.

### Guardrails and unresolved launch criteria
PR #29 remains OPEN / Draft / UNMERGED. Issue #23 remains OPEN. The adapter registry remains empty. Static imports, unit regressions and disposable fake-provider evidence improve coverage but are not a complete transitive runtime/network trace and do not prove universal JIT mediation or certify a real provider.

Last documented hosted Development migration inventory remains W65; W66–W80 are NOT APPLIED, so hosted Research remains blocked. Real email/reset delivery, manual visual QA, leaked-password protection and real-provider certification remain NOT VERIFIED. No hosted database writes, Supabase Main/Production modifications, DNS/billing changes, provider side effects, production deployment or PR merge occurred.


## Superseding checkpoint — 2026-10-13 — code/test HEAD `b9e5ded49cc7da8af5e4d70413b42558cf09c7d9`

This checkpoint supersedes the prior pending-run notes in this file.

### Additional reconciliation authority-tuple validation
When a reconciliation row contains `dispatch_claimed_at`, the gateway now requires the original dispatch authorization tuple to be complete before any provider lookup: approval ID present, `authority_snapshot.requires_approval === true`, valid 64-character hex authority/request digests, and a positive safe-integer budget revision. A partially populated modern dispatch claim is rejected fail-closed. For legacy rows with no `dispatch_claimed_at`, the prior `created_at` time-bound fallback remains supported; no SQL migrations were changed.

Six new regression scenarios test the missing approval, disabled approval requirement, missing/bad hashes and missing/non-positive budget revision. They are added to the prior 18 malformed/unbound reconciliation cases. Web Unit is **335/335, zero failures**.

### Exact-head gate evidence
All six workflows succeeded on this code/test SHA:
- W21 Local Launch Gate: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38412243001
- W25 Isolated PostgreSQL Atomic Fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38412243093
- Web Unit, 335/335: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38412242824
- Web CI / production build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38412242825
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38412243272
- Netlify preview-route verification: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38412243977

W21 artifacts were downloaded and inspected:
- Evidence/cleanup: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38412243001/artifacts/11823012738 — repository migrations replayed on PostgreSQL 17, disposable Supabase stopped with exit code 0, no remaining containers or volumes, `cleanup_verified=true`.
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38412243001/artifacts/11822977850 — unregistered adapter rejected with HTTP 503 / `unregistered_adapter_denied` / `providerCall=not_attempted`; Browser E2E 2 passed (2.5m); cleanup verified.

The evidence file records synthetic W21 test merge SHA `25206644c21e0f97ca7ebd0cc239e6ed258da265`; distinguish it from PR source HEAD `b9e5ded49cc7da8af5e4d70413b42558cf09c7d9`.

### Safety status
PR #29 remains OPEN / Draft / UNMERGED; Issue #23 remains OPEN. Registry remains empty, universal JIT mediation and real-provider certification remain NOT PROVEN. Hosted Development remains documented at W65 and W66–W80 are NOT APPLIED, so hosted Research remains blocked. No hosted DB/data changes, Main/Production modifications, DNS/billing changes, real-provider effects or production deployment occurred.


## Superseding verified checkpoint — 2026-10-13 — code/test HEAD `10c3f5526a3e53dd070715f9ac7c870543bfa933`

This section supersedes the prior checkpoint entries. The exact PR source HEAD and six gate run records were checked before this documentation update.

### Additional fail-closed protection for partial W69 tuples
`validReconciliationClaim` now treats the presence of **any** W69 dispatch-tuple field (`dispatch_claimed_at`, `dispatch_claim_authority_hash`, `dispatch_claim_request_hash`, `dispatch_claim_budget_revision`) as evidence that the row uses the modern dispatch claim contract. If any tuple field is present, all required fields must be valid; a hash or budget revision without a dispatch timestamp can no longer fall through to the legacy `created_at` path.

Three new negative scenarios cover: authority hash only, request hash only, or budget revision only while `dispatch_claimed_at` is null. They are table-driven within the existing 335-test suite. These application-layer guards defend against malformed RPC responses; the existing W69 database constraint already enforces the all-null-or-complete tuple for stored rows. **No SQL migration was changed.**

### Six current-code-head gates — all PASS
- W21 Local Launch Gate: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414260222
- W25 Isolated PostgreSQL Atomic Fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414261406
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414260294 — **335 passed, 0 failed**
- Web CI / production build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414260230
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414260556
- Netlify preview verification: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414260692

W21 artifacts were downloaded and inspected:
- Evidence/cleanup: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414260222/artifacts/11824990132 — `result=success`, migrations replayed from the repository on PostgreSQL 17, disposable Supabase stop exit code 0, no remaining labeled containers or volumes, `cleanup_verified=true`.
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414260222/artifacts/11823980703 — preflight READY, unregistered adapter path returns HTTP 503 / `unregistered_adapter_denied` / `providerCall=not_attempted`; Browser E2E **2 passed (2.7m)**; cleanup VERIFIED.

W21 evidence records synthetic merge-test SHA `87c4c8ad42df5eec3989956208e469d5f6a2d5ed`; its parents are base `46dc6029f084fb000ba511478d6e8aec3eb532b3` and PR source HEAD `10c3f5526a3e53dd070715f9ac7c870543bfa933`. These SHA values must not be conflated.

### Separate tool failure — AI code-scanning review
GitHub's separate “Code scanning AI findings on PR #29” run failed because its review agent exceeded its monthly quota (HTTP 402 / `errorCode=quota`): https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38414263059. This is an unavailable automated AI review, **not** a successful scan and not a failing application test. It should remain visible as a tooling limitation; do not attempt to alter billing or bypass it.

### Guardrails and outstanding launch gates
PR #29 remains OPEN / Draft / UNMERGED; Issue #23 remains OPEN. Provider registry stays empty; universal JIT mediation and real-provider certification remain NOT PROVEN. Hosted Development remains last documented at W65; W66–W80 are NOT APPLIED, so hosted Research remains blocked. No hosted DB changes, Supabase Main/Production changes, DNS/billing changes, real-provider effects or production deployment occurred.


## Superseding verified checkpoint — 2026-10-13 — PR source HEAD `813d97d4b04f9b362ace183c1d648ce6f58ed7aa`

This checkpoint supersedes earlier pending/failed W21 notes. PR #29 remains OPEN / Draft / UNMERGED; Issue #23 remains OPEN.

### Legacy reconciliation safety closure
The application gateway now refuses to persist a provider-reported `SUCCEEDED` result for a legacy `UNKNOWN` execution when no W69 `dispatch_claimed_at` exists. It returns `LEGACY_SUCCESS_WITHOUT_DISPATCH_CLAIM`, leaves the result `UNKNOWN`, and does not call the finalization RPC. This prevents the application from relying solely on the SQL rejection to preserve the invariant.

Compatibility for legacy records is deliberately narrow: the W70 pgTAP contract now also proves a legacy record without a W69 dispatch claim may be settled as `FAILED` only with authoritative no-send evidence, which releases its held budget reservation. W69 dispatch claims are still required before provider success can be accepted.

The W70 test count was corrected from `plan(22)` to `plan(23)` after the first W21 rerun exposed a pgTAP “Bad plan” (23 tests executed vs 22 planned). The subsequent W21 run passed; this was a test-plan mismatch, not a failed assertion.

### All six gates passed on this exact PR source HEAD
- W21 Local Launch Gate: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38420126676
- W25 Isolated PostgreSQL Atomic Fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38420126675
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38420126629 — **336 passed, 0 failed**
- Web CI / production build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38420126712
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38420126788
- Netlify preview-route verification: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38420126697

W21 artifacts were downloaded and inspected:
- Evidence/cleanup: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38420126676/artifacts/11826217860 — `result=success`, repository migrations replayed on PostgreSQL 17, disposable Supabase stop exit code 0, no remaining labeled containers or volumes, `cleanup_verified=true`.
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38420126676/artifacts/11826417697 — launch preflight READY; worker with unregistered adapter denied HTTP 503 / `unregistered_adapter_denied` / `providerCall=not_attempted`; Browser E2E **2 passed (2.3m)**; cleanup verified.
- W21 completed all 25 steps without failures, including actual-ledger idempotency, authority-budget, one-time dispatch-claim and one-time reconciliation-claim races, plus W72 PostgreSQL gateway integration using fake providers.

W21 logs report synthetic merge-test SHA `f3251ab7694b66aded386de1079561827f271d94`, with parents base `46dc6029f084fb000ba511478d6e8aec3eb532b3` and PR source HEAD `813d97d4b04f9b362ace183c1d648ce6f58ed7aa`. Keep these SHAs distinct.

### Scope / guardrails unchanged
No application provider is registered; provider registry remains empty. These tests use a disposable PostgreSQL 17 stack and fake providers, not real external sends. Universal JIT enforcement over every relevant outbound effect is still **NOT PROVEN**. Hosted Development remains last documented at W65; W66–W80 are NOT APPLIED, so hosted Research remains blocked. Real email/reset delivery, manual visual QA, leaked-password hardening and real-provider certification remain NOT VERIFIED. No hosted database writes, Main/Production changes, DNS/billing changes or production deployment occurred.


## Superseding exact-head checkpoint — 2026-10-13 — PR source HEAD `b0f050afb0ebdd7d5ce7d8350b6615b0bd4e5793`

This checkpoint supersedes earlier pending-run notes. The PR source head, Issue state, and workflow metadata were rechecked before recording.

### Exact-head gate status — all PASS
- W21 Local Launch Gate: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38424374751
- W25 Isolated PostgreSQL Atomic Fence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38424374681
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38424374680 — **337 passed, 0 failed**
- Web CI / typecheck / production build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38424374676
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38424374691
- Netlify preview-route verification: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38424374689

W21 artifacts were downloaded and inspected:
- Evidence/cleanup: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38424374751/artifacts/11827823136 — repository migrations replayed on PostgreSQL 17, disposable Supabase stop exit code 0, no remaining labeled containers or volumes, `cleanup_verified=true`.
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38424374751/artifacts/11827953013 — preflight READY; unregistered adapter denied with HTTP 503 / `unregistered_adapter_denied` / `providerCall=not_attempted`; Browser E2E **2 passed (2.2m)**; cleanup VERIFIED.

### Latest security hardening
- Reconciliation claim validation rejects malformed/unbound timestamps and partial modern W69 dispatch tuples before the reconciliation adapter is called.
- A legacy `UNKNOWN` execution lacking W69 dispatch-claim proof is never marked `SUCCEEDED` on provider lookup alone; it remains `UNKNOWN`. A legacy attempt may settle `FAILED` only with authoritative no-send proof.
- W69 schema constraint tests reject partial dispatch tuples at the database layer; W70 pgTAP has been aligned to 23 assertions and covers legacy success denial/no-send compatibility.
- The Mission Action source-graph test blocks direct HTTP transport use and a documented denylist of known provider SDK imports (OpenAI, Resend and selected common provider SDKs) in the statically reachable Mission Action API graph. This is a preventive test guard, not proof that every possible outbound SDK or dynamic import is covered.

The recent source/test commits changed the gateway, tests and SQL test files; **no Supabase migration file was changed or applied** in this hardening pass.

### SHA precision
W21 artifact `git_sha=479216e629048f6659796c85cc699c5109d3fc6a` is GitHub's synthetic PR merge-test commit. Its parents are base `46dc6029f084fb000ba511478d6e8aec3eb532b3` and PR source HEAD `b0f050afb0ebdd7d5ce7d8350b6615b0bd4e5793`. Report these as distinct SHAs.

### Unchanged constraints / blockers
PR #29 remains **OPEN / Draft / UNMERGED**. Issue #23 remains **OPEN**. Provider registry remains empty. Universal JIT mediation across every relevant outbound effect and a real provider adapter remain **NOT PROVEN / NOT APPROVED**. Hosted Development is last documented at W65; W66–W80 remain NOT APPLIED, so hosted Research remains blocked. Real email/password-reset delivery, manual visual QA and leaked-password protection remain unverified. No hosted DB write, Supabase Main/Production change, DNS/billing change, real provider side effect or production deployment occurred.

 
## Superseding checkpoint — 2026-10-13 — code/test HEAD `0945d9f4e1b709d2cb8ba28fd3f5dc22415c337f`

This is the current PR source head at the time of this checkpoint. PR #29 remains OPEN / Draft / UNMERGED; Issue #23 remains OPEN.

### Latest test-only outbound-graph detector hardening
Compared with prior source HEAD `d3bffe58224d4dc6442ed42a9040bf40cfa59bcc`, this commit modifies only `apps/web/test/mission-authority-worker-auth.test.mjs`. It expands source-graph guard coverage to recognize:
- `fetch.call/apply`
- computed access to `globalThis/global/self/window["fetch"|"WebSocket"|"XMLHttpRequest"|"EventSource"]`
- WebSocket, EventSource and XMLHttpRequest constructors
- `navigator.sendBeacon`
- Node `net.connect`, `tls.connect`, and `dgram.createSocket`
- outbound-capable transport imports `node:net`, `node:tls`, `node:dgram`, `ws`, `websocket`, `eventsource`, and `xhr2`.

Current exact-head test evidence:
- [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38430635229): **338 passed / 0 failed**
- [Web CI / production build](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38430635220): SUCCESS
- [Flutter CI push](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38430635208): SUCCESS
- [Flutter CI PR](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38430642628): SUCCESS
- [Netlify Preview verification](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38430642571): SUCCESS.

The most recent W21/W25 full isolated launch suite passed on prior source HEAD `d3bffe58224d4dc6442ed42a9040bf40cfa59bcc` immediately before this test-only change:
- [W21 Local Launch Gate](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38429145307)
- [W25 Isolated PostgreSQL Atomic Fence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38429145282)
- [W21 evidence and cleanup](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38429145307/artifacts/11830860215): PostgreSQL 17, repo migration replay, disposable Supabase stop exit code 0, no remaining containers/volumes, `cleanup_verified=true`.
- [W21 browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38429145307/artifacts/11830581000): missing adapter denied with HTTP 503, `unregistered_adapter_denied`, `providerCall=not_attempted`; Browser E2E **2 passed (2.4m)**; cleanup verified.

W21's evidence records synthetic merge-test SHA `965e0ba3fbaaa88804c2f433c6b091cbee692b89` (parents: base `46dc6029f084fb000ba511478d6e8aec3eb532b3`, source head `d3bffe58224d4dc6442ed42a9040bf40cfa59bcc`). This is not the PR source head.

### Interpretation and safety
These are conservative, direct-source detectors over the statically reachable local source graph. They still do not prove a complete runtime call graph, computed alias analysis, package-internal behavior, or a full network trace. Do not present the test as universal enforcement proof. The adapter registry remains intentionally empty. No production logic or SQL migration changed in commit `0945d9f`; no hosted Supabase changes, real provider I/O, DNS/billing changes or production deployment occurred. Hosted Development remains last documented at W65; W66–W80 are NOT APPLIED, so hosted Research stays blocked.


## نقطة تسليم محدثة — 2026-10-13 — HEAD `2bcea5a9c12852f336973f3f0066d944384a6769`

هذه أحدث نقطة تحقق حية، وتعلو على أي ملاحظة أقدم عن فشل W21 أو بقاء الاختبارات قيد التنفيذ.

### إغلاق W21
نجحت جميع بوابات الرأس الحالي:
- W21: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38435928163
- W25: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38435927175
- Web Unit: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38435927129 — 341 اختبارًا ناجحًا، صفر فشل
- Web CI / build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38435927161
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38435927480
- Netlify Preview: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38435927505

تم تنزيل وفحص أدلة W21:
- دليل PostgreSQL/التنظيف: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38435928163/artifacts/11833646432 — إعادة تشغيل migrations من المستودع على PostgreSQL 17، `supabase_stop_exit_code=0`، لا حاويات أو وحدات تخزين متبقية، و`cleanup_verified=true`.
- تشخيص المتصفح: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38435928163/artifacts/11833706506 — فحص العامل يعيد HTTP 503 عند عدم وجود adapter مع `providerCall=not_attempted`، وBrowser E2E: **2 passed (1.9m)**، وتنظيف VERIFIED.

SHA التمييز: artifact يستخدم merge-test SHA `1c209060cbafcedebd84dbc57bdc4608e706eff6`، وهو commit اصطناعي من GitHub وأبواه قاعدة PR `46dc6029f084fb000ba511478d6e8aec3eb532b3` وHEAD المصدر `2bcea5a9c12852f336973f3f0066d944384a6769`.

### إصلاح سبب فشل W21 السابق
كان فشل الرأس السابق في signup/reset بسبب عدم توفر خدمة Pwned Passwords الخارجية؛ صفحة التسجيل تصرفت بشكل آمن وأغلقت التسجيل مؤقتًا. عُدّل اختبار Playwright فقط ليعترض POST إلى `/api/auth/password-policy` ويعيد 204 حتميًا في سياق المتصفح التجريبي. لم يتغير route الإنتاج أو دالة السياسة؛ تظل السياسة الفعلية fail-closed عند تعذر الخدمة، وتغطي اختبارات `password-policy.test.mjs` منطق التجزئة والرفض عند تطابق كلمة مخترقة والفشل الآمن عند تعطل المصدر. لذلك W21 لا تعتمد على خدمة خارجية غير حتمية لإنجاز دورة auth.

### تقوية التفويض وفحوص المخرجات
- بوابة المصالحة تتحقق من ربط وقت المطالبة بزمن dispatch، وترفض tuple جزئيًا، وتحافظ على حالة UNKNOWN إذا لم يوجد إثبات dispatch موثوق. اختبارات W70 تمنع نجاح reconciliation القديم دون dispatch claim، وتسمح بحالة FAILED فقط مع دليل authoritative `provider_not_sent` و`safe_to_retry`.
- اختبار W69 يتحقق من رفض tuples جزئية لمطالبة dispatch.
- AST source-graph guard يتتبع imports محلية ثابتة ويرفض مراجع النقل/التحميل الحساسة واستدعاءات dynamic/computed global paths، بما فيها alias للـglobal object أو تمرير مرجع النقل إلى helper. هذا فحص static bounded، وليس trace كاملًا لكل تشغيل runtime أو لكل شبكة.
- سجل adapters ما زال `Object.freeze({})`؛ لا adapter حقيقي مسجل أو معتمد.

### الحواجز المتبقية
PR #29 ما زال OPEN / Draft / UNMERGED، وIssue #23 OPEN. لم يحدث أي تغيير في Supabase Development أو Main/Production أو DNS أو billing أو الإنتاج. آخر جرد موثق لقاعدة Development هو W65؛ ترحيلات W66–W80 لم تطبق على البيئة المستضافة، ولذلك يبقى Research الحي محظورًا. إثبات فرض JIT الشامل على كل التأثيرات الخارجية، اعتماد adapter حقيقي، تسليم بريد حقيقي، مراجعة واجهة يدوية، وحماية كلمات المرور المسرّبة ما تزال NOT VERIFIED/NOT APPROVED. لا تُفرغ سجل adapters ولا تغلق Issue #23 حتى تكتمل هذه الأدلة.

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

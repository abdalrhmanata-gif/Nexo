# ZAVQERA — Master Handoff / Continuation Brief

**Snapshot date:** 2026-10-12, Europe/Oslo  
**Purpose:** Preserve the implementation state, verified evidence, product decisions, non-negotiable safety boundaries, and next actions so work can continue in a new ChatGPT conversation without restarting or losing context.

> **Read this first in any new conversation.** Treat the repository and live tool results as authoritative; re-check the current branch SHA and statuses before acting. This file is a handoff, not an authorization to deploy, migrate a database, spend money, or perform a real external side effect.

## 1. Executive status

ZAVQERA is an AI Mission Delegation Layer, not a generic chatbot. A Mission specifies the goal, permitted and forbidden actions, budget, and expiry. Personal and Business experiences should share one core. The platform is intended to be provider/model/storage/backend neutral, API-first, modular, multi-tenant ready, and suitable for web, Flutter, SDKs, workers, and APIs.

**Current release status (rechecked 2026-10-12):**
- Automated isolated engineering gates are green on the exact candidate HEAD recorded below.
- The W21 launch gate includes disposable PostgreSQL 17 migration replay + pgTAP, Mission Authority SQL regressions, AI quota/workspace tests, real-ledger concurrency tests, persistent gateway integration using **fake providers**, browser E2E (2/2), disposable-stack cleanup, and evidence artifacts.
- This does **not** equal production security certification, hosted Research readiness, successful real provider side effects, full UI visual QA, or launch approval.
- Hosted Supabase Development is behind the branch migrations and has a confirmed legacy Research RPC privilege gap. Hosted Research must stay blocked.
- PR #29 remains OPEN / Draft / Unmerged. Do not merge or mark Ready unless the owner explicitly requests it.
- No Supabase Main/Production, Git `main`, production promotion, DNS, billing, or live provider side effects were changed during this work.

## 2. Exact repository and CI snapshot

- Repository: https://github.com/abdalrhmanata-gif/Nexo
- Active branch: `zavqera/ai-planner-integration`
- Candidate branch HEAD at this verification: `7a2e559d3f6c3a91b69bce387f2adf98c17ee3d7`
- HEAD commit: `test: cover future-dated reconciliation evidence`
- PR #29: https://github.com/abdalrhmanata-gif/Nexo/pull/29 — OPEN / Draft / Unmerged
- PR base: `zavqera/alternative-web-deployment`
- The latest full set of successful checks was on the exact SHA above:
  - Web Unit: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38286550381
  - Web CI / TypeScript / build: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38286550658
  - Flutter CI: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38286550437
  - W25 isolated PostgreSQL atomic fence: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38286550475
  - W21 Local Launch Gate: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38286550451
  - Netlify workflow: SUCCESS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38286550402
- W21 evidence and cleanup artifact (latest completed run): https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38286550451/artifacts/11764008291
- W21 browser diagnostics artifact: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38286550451/artifacts/11763683374
- W21 confirmed the actual steps for disposable PG17 replay/pgTAP, Mission Authority SQL regressions including W67, quota/workspace security, actual-ledger idempotency, atomic budget, one-time dispatch claim, one-time reconciliation claim, W72 persistent gateway integration with fake adapters, browser E2E 2/2, disposable stack cleanup and cleanup verification.
- Note on SHA interpretation: for GitHub `pull_request` events, the evidence file's `GITHUB_SHA` may be the PR merge ref. Use the workflow run's `head_sha` and the PR head SHA to identify the actual feature branch commit. Do not misread a different merge ref as the tested branch HEAD.
- The handoff itself is a documentation-only change to be made after this snapshot. Its new HEAD must be rechecked; do not claim new-HEAD CI success until workflows for it complete.

## 3. Platform and environment restrictions — never violate

1. **Netlify is the deployment platform in use.** Do not steer the owner back to Vercel or send Vercel status/update suggestions unless explicitly asked.
2. Supabase Development project: `mrwmmbytcymqgwvcoywd`, region `eu-west-1`, PostgreSQL 17.
3. **Do not modify Supabase Main/Production** or Git `main`. Do not change Production deployment, DNS, billing, or upgrade a plan without explicit permission.
4. Do not merge or mark PR #29 Ready without an explicit owner request.
5. Do not apply hosted Development migrations, alter hosted grants/functions, or make any schema/RPC change without separate review and explicit authorization. Issue #23 has an explicit guardrail; preparing a runbook, inspecting the schema, or saying “continue” is not schema-change authorization.
6. Do not run hosted authenticated live Research until schema parity/grants are fixed, catalog verification passes, and a separate test has been explicitly authorized. That test writes persistent Mission/execution/history records.
7. Do not register a real external provider or run side-effecting provider actions. Provider registry intentionally remains empty; the gateway tests use fake providers.
8. Do not paste credentials or secrets into chat, docs, commits, GitHub issues/comments, or PR comments. Use only private, non-production environment configuration for opt-in tests.
9. Do not claim Production readiness, universal JIT enforcement, real-provider success, or hosted Research success from isolated tests.
10. If the hosted rollout fails, stop on the first failure. Do not continue migrations, manually edit the migration ledger, or blindly replay a migration. Do not use ad hoc dashboard SQL to imitate repository migrations.

## 4. Critical current Supabase Development finding

A fresh read-only query made during this handoff reconfirmed:

- Latest hosted migration is `20261011150000` — W65.
- `public.mission_authority_budgets`: absent.
- `public.mission_authority_budget_reservations`: absent.
- W79 seven-argument requester-bound Research completion functions are absent in both public and private schemas:
  - `public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)`
  - `private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)`
- Legacy six-argument functions still exist:
  - `public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)`
  - `private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)`
- `authenticated` has EXECUTE on **both** legacy functions.
- `anon` has EXECUTE on neither.
- The legacy private function is `SECURITY DEFINER`; the direct authenticated EXECUTE grant is particularly important.

### Why this is blocking

A signed-in user with an eligible RUNNING read-only Research execution may use the old completion boundary to submit fabricated unverified completion content under its legacy checks. The currently deployed schema therefore has a confirmed Research-integrity gap, not just a missing route contract.

The current branch's `apps/web/app/api/missions/[id]/research/route.ts` performs a trusted schema preflight before quota reservation/provider I/O. The internal worker route probes the expected seven-argument RPC signature and fails closed if the exact expected malformed-UUID coercion cannot be observed. This guards the current application route, but it **does not revoke the database's legacy grants**. Do not infer that the code preflight alone removes the DB vulnerability.

### W67 exists on the candidate branch but is NOT hosted

- Migration: `supabase/migrations/20261011165000_w67_legacy_research_rpc_privilege_hardening.sql`
- It revokes EXECUTE on both old six-argument functions from `public`, `anon`, `authenticated`, and `service_role`.
- Its pgTAP regression is `supabase/tests/w67_legacy_research_rpc_privilege_hardening.sql`.
- W67 is included in the isolated W21 migration replay and passed there.
- W67 has **not** been applied to hosted Development. No live privilege/schema change was made.

The new W67 migration is a potential immediate fail-closed mitigation to review because it intentionally disables Research until the complete trusted W79 contract exists. However, do not deploy it automatically: first follow Issue #23's separate review/authorization rule. Decide explicitly whether to authorize a reviewed W67-only mitigation (Research would remain intentionally disabled) or the complete reviewed W66–W79 rollout. No such authorization is established by this handoff.

## 5. Candidate migration sequence and dependency map

Repository migrations absent from hosted W65 state:

1. `20261011160000_w66_service_role_table_privilege_hardening.sql` — revoke direct `service_role` writes to `public.agent_executions`; use guarded RPCs instead.
2. `20261011165000_w67_legacy_research_rpc_privilege_hardening.sql` — revoke all API-role EXECUTE on both legacy six-argument completion functions; intentionally fail closed during incomplete rollout.
3. `20261011170000_w68_persistent_authority_budget_reservations.sql` — persistent mission authority budget/reservation tables and atomic action/spend reservation at execution start.
4. `20261011180000_w69_one_time_jit_dispatch_claim.sql` — JIT dispatch-claim fields and one-time claim boundary.
5. `20261011190000_w70_durable_unknown_outcome_reconciliation.sql` — durable reconciliation claim/lease/token and settlement path for UNKNOWN external outcomes.
6. `20261012070000_w71_expired_external_execution_budget_recovery.sql` — retain/hold uncertain external budget reservations when a lease expires.
7. `20261012120000_w73_trusted_system_mission_events.sql` — narrowly allowlisted trusted SYSTEM mission events bound to actual execution state.
8. `20261012130000_w74_reconciliation_claim_freshness.sql` — settlement evidence must post-date the active reconciliation claim.
9. `20261012140000_w75_correlatable_provider_receipt.sql` — successful external side effects require a stable provider receipt/reference.
10. `20261012150000_w76_guard_external_success_on_insert.sql` — apply the receipt invariant to INSERT and UPDATE.
11. `20261012160000_w77_read_only_research_payload_bounds.sql` — cap/allowlist Research payload and source fields.
12. `20261012170000_w78_bind_research_history_to_execution.sql` — history must match the exact completed execution, request, summary, source count and sources.
13. `20261012180000_w79_trusted_research_completion.sql` — remove old completion signatures and install the requester-bound seven-argument trusted completion contract.

**W72 is persistent gateway integration code/test, not a SQL migration; do not invent a W72 migration.** W67 is now a SQL migration and must not be omitted from the sequence.

Primary rollout and audit docs:
- [Launch gate status](https://github.com/abdalrhmanata-gif/Nexo/blob/zavqera/ai-planner-integration/docs/ZAVQERA_LAUNCH_GATES_STATUS.md)
- [Development migration rollout plan](https://github.com/abdalrhmanata-gif/Nexo/blob/zavqera/ai-planner-integration/docs/ZAVQERA_DEVELOPMENT_MIGRATION_ROLLOUT_W66_W79.md)
- [Hosted Dev migration parity audit](https://github.com/abdalrhmanata-gif/Nexo/blob/zavqera/ai-planner-integration/docs/ZAVQERA_HOSTED_DEV_MIGRATION_PARITY_AUDIT_W66_W79.md)
- [Mission Authority contract v0.1](https://github.com/abdalrhmanata-gif/Nexo/blob/zavqera/ai-planner-integration/docs/ZAVQERA_MISSION_AUTHORITY_CONTRACT_v0.1.md)
- [Mission Authority evidence and acceptance](https://github.com/abdalrhmanata-gif/Nexo/blob/zavqera/ai-planner-integration/docs/ZAVQERA_MISSION_AUTHORITY_EVIDENCE_AND_ACCEPTANCE_2026-10-10.md)
- [Source audit](https://github.com/abdalrhmanata-gif/Nexo/blob/zavqera/ai-planner-integration/docs/ZAVQERA_MISSION_AUTHORITY_SOURCE_AUDIT_2026-10-01.md)
- [Entrypoint review](https://github.com/abdalrhmanata-gif/Nexo/blob/zavqera/ai-planner-integration/docs/ZAVQERA_MISSION_AUTHORITY_ENTRYPOINT_REVIEW_2026-10-01.md)
- [Issue #23 — JIT enforcement acceptance criteria and guardrails](https://github.com/abdalrhmanata-gif/Nexo/issues/23)

## 6. Mission Authority and Research implementation map

Useful source paths on the candidate branch:

- Authenticated Research route and fail-closed preflight: `apps/web/app/api/missions/[id]/research/route.ts`
- Trusted internal worker route and schema probe: `apps/web/app/api/internal/agent-executions/[executionId]/route.ts`
- Requester-bound completion preflight recognizer: `apps/web/lib/mission-authority/research-completion-schema-preflight.mjs`
- Persistent dispatch/reconciliation gateway: `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs`
- Provider adapter registry: `apps/web/lib/mission-authority/provider-adapter-registry.mjs`
- Worker request auth: `apps/web/lib/mission-authority/worker-auth.mjs`
- W64/W77/W78/W79 and corresponding tests reside in `supabase/migrations/` and `supabase/tests/`.
- W21 workflow: `.github/workflows/zavqera-w21-e2e.yml`.

Core design invariants: external side effects need a server/adapter JIT check against current authoritative state immediately before I/O; clients/models/envelopes/passports cannot create or broaden authority; explicit deny wins; budget reservations are atomic; repeated dispatch is prevented by idempotency/one-time claim; UNKNOWN outcomes must not be blindly retried; reconciliation must be a durable leased claim; provider success must have a correlatable receipt; histories must be bound to the durable execution; unverified Research output is not business outcome verification.

The SQL/gateway tests are meaningful isolated proofs. They do not establish that a production server route is wired to a real provider, that every external side effect is universally enforced, or that real-provider reconciliation works. Issue #23 acceptance remains open; related issues #24 and #25 should be rechecked before release certification.

## 7. Remaining release gates

1. **Hosted schema/grant parity:** BLOCKED / NOT APPLIED. Review and explicitly authorize a Development-only mitigation/rollout; do not change hosted schema just because the SQL is green in disposable PostgreSQL.
2. **Authenticated hosted live Research:** NOT VERIFIED. Requires W79 parity, a dedicated confirmed Development test account, private non-production credentials/secrets, and separate authorization because persistent rows/history are created.
3. **Real OpenAI provider behaviour and persistent citations/history:** prior planning smoke tests do not prove the authenticated hosted Research path. Provider registry intentionally has no real side-effect adapter registered.
4. **Workspace invitation email:** code is implemented, but true Resend delivery is NOT VERIFIED. Needs Deploy Preview-scoped `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, verified sender domain, and checking delivery/bounce status.
5. **Password-reset email/callback:** end-to-end hosted verification is NOT VERIFIED.
6. **Manual visual QA:** desktop and mobile visual inspection against current Netlify preview is NOT VERIFIED; browser E2E is not a substitute.
7. **Security Advisor:** `auth_leaked_password_protection` is WARN / Disabled. Owner deferred Supabase Pro upgrade; no billing/plan change without permission.
8. **Full Mission Authority:** universal provider-neutral server-side JIT enforcement and complete acceptance matrix remain NOT PRODUCTION-CERTIFIED.

## 8. Product vision, implemented product direction, and UX decisions

### Product identity

- Product name: **ZAVQERA** (project originated as NEXO; repository remains `Nexo`).
- Vision statement: “One intelligence. Many capabilities. Everything connected.”
- Positioning: Mission-based Delegation Layer, not an attempt to replace OpenAI, Microsoft or Google model platforms. Differentiate via mission scope, approvals, evidence, verification, budget and accountability.
- Mission is the core unit and contains: **Goal, Allowed actions, Not allowed actions, Budget, Expiration**.
- Domain concepts: Principal, Intent, Mission, Authority, Policy, Agent, Action, Evidence, Verification.
- Personal and Business experiences should ship from one shared core from day one.
- Desired architecture is provider/model/storage/backend neutral, API-first, modular, multi-tenant ready, and decoupled from Flutter, Supabase/Postgres, OpenAI, and any one queue/worker/provider in the domain core. This is the intended architecture; do not assume all neutrality goals are already fully achieved by current implementation.
- Templates and shareable links are a major growth/viral loop priority.

### Product features reported implemented / in branch direction (verify source/CI before changing)

- Workspace membership and roles: Owner/Admin/Member/Viewer.
- Approval Engine: approval request attached to Mission/Action, scope-bound, Pending → Approved/Rejected/Cancelled, decision recorded in Mission History.
- Agent Registry in Workspace; first agent is ZAVQERA Research Agent with read-only limits.
- Business Control Center: Missions, pending approvals, agents, workspace members, verification and outcomes.
- Action-level approval requests and owner/admin approve/reject flows.
- Verification and outcome views.
- Business-only notification bell and actionable notifications deep-linking to missions/approvals.
- Mission templates, sharing links, starter/template ideas and multi-language direction.
- Mobile improvements; English/Norwegian/Arabic language work has been mentioned; business strings require checking in actual preview.
- AI Planner integration is on the active feature branch; successful OpenAI planning smoke testing has previously been reported, but do not confuse that with authenticated live Research verification.
- Workspace invitation email code has been added; actual delivery still requires external config/evidence.

### Pricing hypotheses (not final)

Previously discussed starter pricing:
- Free: 5 missions.
- Plus: USD $9/month, 50 missions.
- Pro: USD $25/month, 300 missions.
These are hypotheses to validate, not final committed pricing. Clarify how “mission count” is metered (created, active, executions, or completed missions), cost protections, model usage and value before locking pricing. Team/Business/API tiers were also considered.

### Visual style

Dark base and turquoise are the current anchor. A light-blue accent was discussed but not finalized. Prefer subtle light-blue secondary states/highlights only if tested for contrast and coherence; do not overhaul the palette casually. No definitive final colour-system change has been agreed.

## 9. Product owner preferences and collaboration rules

- Continue in Arabic unless the owner switches language.
- Work as project lead: carry forward decisions, perform safe work proactively, and don’t repeatedly ask for information already recorded here or in the repo.
- Give concrete evidence and exact status; never say “done” without verifying the effect.
- Distinguish verified facts, reported prior results, hypotheses, and blockers.
- Do not force the owner to re-explain project history in a new conversation. Read this handoff and the linked status/runbook files first.
- Keep PR #29 Draft until explicitly told otherwise.
- Do not direct the owner to Vercel; Netlify is current.
- No background promises or estimates. Perform safe actions in the current turn and report what was and was not done.

## 10. Next actions — ordered, do not skip the guardrail

1. **Start by rechecking live state:** branch HEAD, PR #29 state, all workflow conclusions for that exact HEAD, latest W21 evidence/cleanup artifacts, current hosted Development migration ledger and RPC privileges. The handoff commit changes the branch SHA, so re-check statuses on the new HEAD.
2. Update or cross-link the launch status/runbook only if new evidence is verified; avoid duplicate contradictory “latest status” text.
3. Finish the read-only source/schema review of W66/W67/W68–W71/W73–W79 and verify W67's tested semantics. Decide whether an owner-reviewed immediate W67-only fail-closed mitigation is appropriate versus the complete W66–W79 rollout. Do not apply either without the separate explicit authorization required by Issue #23.
4. If and only if specifically authorized for hosted Development, follow the committed rollout plan and exact ordered migration runner. Stop on first failure; perform immediate catalog/signature/grant verification. Keep Research disabled until all expected invariants pass.
5. Only after successful parity and separate authorization, evaluate the opt-in authenticated Research test with a dedicated non-production Development account. Do not use Production credentials.
6. Continue independent launch tasks that do not touch protected environments: review Netlify invitation-email setup/document the required Deploy Preview-only secrets without revealing values, prepare manual desktop/mobile visual QA checklist, verify password-reset callback path, and keep release-readiness status accurate.
7. Before any release decision, resolve issues #23–#25 acceptance requirements and get explicit owner approval.

## 11. Latest read-only hosted query result (for comparison)

The most recent query returned:
```
latest_migration = 20261011150000
budgets = null
reservations = null
new_public_completion = null
new_private_completion = null
legacy_public_exists = true
legacy_private_exists = true
authenticated_can_execute_legacy_public = true
authenticated_can_execute_legacy_private = true
anon_can_execute_legacy_public = false
anon_can_execute_legacy_private = false
```
No changes were made by this query.

**Final handoff decision:** automated local gates PASS; hosted Research is BLOCKED by known Development schema/grant drift; full launch is NOT APPROVED. Continue from the current repo evidence, not from assumptions, and never infer deployment permission from the request to “continue.”


## Superseding W21 verification — 2026-10-12 — tested branch HEAD `7a2e559d3f6c3a91b69bce387f2adf98c17ee3d7`

Live Actions inspection on the exact feature-branch SHA confirms **W21 Local Launch Gate PASS**:
- Run 38289544742 (run number 957): https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544742
- The `w21-e2e` job and every listed step completed successfully: disposable PostgreSQL 17 migration replay/pgTAP; Mission Authority security regressions; AI quota/plan/workspace tests; actual-ledger idempotency, budget, dispatch-claim and reconciliation-claim concurrency proofs; W72 persistent gateway integration with fake providers; full launch-gate browser E2E; disposable Supabase cleanup; cleanup verification; evidence writing; and both artifact uploads.
- Evidence artifact `zavqera-w21-evidence` (11764643205; SHA-256 `923a2dc095d8074816f6276eed71dc998f3f5dc11cb7ec9514b9b43f678e7b44`, not expired): https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544742/artifacts/11764643205
- Browser diagnostics artifact `zavqera-w21-browser-diagnostics` (11764364237; SHA-256 `8ffbb839c63a2b38a01d04f19f3c021c22a9ebd75057d6fc34c55daf3b04c49f`, not expired): https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544742/artifacts/11764364237
- Supporting runs tied to this SHA by the commit workflow-runs API: Web Unit 38289544756 PASS; Web CI 38289544739 PASS; Flutter CI 38289544914 PASS; W25 isolated PostgreSQL atomic fence 38289544646 PASS; Netlify workflow 38289544695 SUCCESS. The Netlify job verified preview routes, while deployment and real-provider/live-research steps were skipped; this is not production deployment or live provider evidence.
- The exact-SHA combined-status API reports the `netlify/unique-kringle-3ce321/deploy-preview` status SUCCESS.
- PR #29 remains OPEN / Draft / Unmerged. The current Actions runs identify branch `zavqera/ai-planner-integration` at this SHA; the PR search confirms #29 remains open. No merge or Ready conversion was made.

The successful cleanup step and its separate cleanup-verification step are directly shown in the W21 job result. The evidence artifact is present and available; the archive itself was not unpacked in this verification, so no additional claim about its internal JSON contents is made.

### W74 test-coverage clarification
The initial observation that no separate `supabase/tests/w74_reconciliation_claim_freshness.sql` exists is accurate, but it is **not evidence that the W74 behavior lacks regression coverage**. The existing `supabase/tests/w70_durable_unknown_outcome_reconciliation.sql` asserts that the reconciliation function checks both `RECONCILIATION_EVIDENCE_PRECEDES_EXECUTION` and `RECONCILIATION_EVIDENCE_PRECEDES_CLAIM`; its behavioral test exercises stale evidence for both dispatch and the active claim, verifies rejection, and verifies that the execution remains `UNKNOWN`, the reservation remains `HELD_UNKNOWN`, and the claim token remains intact. W21 ran this W70 test after replaying the W74 migration and the whole gate passed. Do not create a duplicate W74 test solely to mirror the migration number; a separate test may still be useful later if it adds distinct assertions (for example, future-dated evidence boundary behavior) and is wired into the workflow.

### Status boundary
This PASS is isolated CI evidence, not hosted Development schema parity, live Research/citation/history proof, real email inbox delivery, manual visual QA, or Production certification. Hosted Development remains on W65 per the last read-only audit; legacy six-argument Research completion functions remain executable by `authenticated`. Do not apply hosted migrations or run hosted Research without separate review and explicit authorization. No hosted schema/grants, Supabase Main/Production, Git `main`, production deployment, DNS, billing, or real provider side effects were changed.

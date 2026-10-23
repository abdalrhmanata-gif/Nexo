# ZAVQERA Continuity Handoff — 2026-10-23

> **Read this first in the next conversation.** This file is the current continuity checkpoint for the ZAVQERA engineering/release thread. It separates confirmed current state from older evidence. Do not repeat already completed work or assume a previous deployment version is still active.

## 1. Current executive status

**Release decision: NO-GO.** Public/paid launch is not approved. `candidate_sha=NONE`; `hosted_write_authorized=false`; trusted external dispatch/provider adapters remain empty or fail-closed.

Latest verified project read-back is from 2026-10-23 conversation checks (hosted function metadata timestamp below is 2026-10-22 UTC):

- Supabase project: **ZAVQERA Development**, ref `mrwmmbytcymqgwvcoywd`, region `eu-west-1`, PostgreSQL 17.6.
- Hosted Edge Function `ai-plan`: **ACTIVE version 4**, `verify_jwt=true`, update time `2026-10-22T12:06:41.488Z`, bundle SHA-256 `245907cc77df7c5df142cc1ea89f26d930cfbb75e8a1c7b028b2a72abd52773f`.
- **Version 4 is a temporary fail-closed stub** (23-line `index.ts` plus tiny `deno.json`). It handles CORS OPTIONS, returns 405 for non-POST, and returns `503 ai_quota_enforcement_not_configured` for every POST. It does not call OpenAI, access an API-key secret, or parse/read the POST body. Gateway JWT verification remains enabled. This is the current state, superseding older notes saying version 2 or 3.
- Version 4 source is not yet reconciled into a reviewed/version-controlled source commit. Its metadata does not identify who/what caused the deployment. **Do not attribute it to a person or workflow without deployment-audit evidence.** Keep the safe stub behavior; do not re-enable the provider.
- Hosted migration ledger: **74 rows**, latest `20261011150000 / w65_agent_execution_table_write_boundary`. No W66–W82 migration has been applied according to the current ledger.
- Candidate source branch `zavqera/ai-planner-integration`, pinned at `1b02272a7281b2e9ebf9020cd21a8ac9de3e577e`, contains **87 SQL migration files**. Read-only version/name comparison: **46 exact tuple matches**, **41 source tuples absent as exact hosted tuples**, **28 hosted tuples absent as exact source tuples**; 22 are same-name/different-version mismatches and 6 are hosted-only names. This does not prove historical SQL-byte equality or deployment receipts.
- A fresh advisor read returned `auth_leaked_password_protection` **WARN: disabled**. Earlier evidence flags three `private.anonymous_ai_*` tables with RLS disabled as CRITICAL, while direct table ACL evidence did not establish direct grants to `anon`/ `authenticated`/ `service_role`. Treat the discrepancy as unresolved and require independent review; do not blindly change RLS/ACLs.
- Netlify preview workflow PR #46 remains unable to create a preview because GitHub Actions lacks `NETLIFY_AUTH_TOKEN`. It has failed twice at the explicit credential guard before calling the Netlify deploy API. A real draft preview URL has not been created/verified.
- No production deployment was initiated by the current work. However, a prior real production-context Netlify deployment incident exists and must not be described as “no production deployment ever happened.”

## 2. Core project architecture and stable constraints

ZAVQERA’s product direction: **“One intelligence. Many capabilities. Everything connected.”** It is a provider-agnostic, backend-agnostic, storage-agnostic, queue/worker-agnostic, API-first platform for AI Agents, voice, chat, messaging, automations, apps and SDKs. Domain/application contracts must remain independent of Flutter, Supabase, PostgreSQL and OpenAI.

Core authority flow:
`User Goal → Intent → Identity → Authority → Policy → Authorization → Plan → Action → Execution → Evidence → Verification → Outcome`

“Mission” is the core unit; the “Delegation Layer” controls work. AI output is an untrusted proposal and does not itself grant authority, execute external actions, spend money, or claim verification. All external side effects require the proper server-side authority/approval/lease/budget checks, idempotency, evidence and reconciliation.

Hard guardrails:
- Never alter Supabase Main/Production, production secrets, production DNS, billing, protected PRs #12/#19/#20, or live deployment behavior without explicit owner authorization and a separate reviewed plan.
- The most recent explicit owner approval was narrowly for **one containment deployment to Supabase Development only**. It is not blanket authorization for another hosted write, schema migration, secret mutation, a live provider test, or Production.
- Do not apply migrations W66–W82 to hosted Development until historical provenance and parity are reconciled and explicit Development-only authorization supersedes the guardrail recorded in Issue #23.
- Do not read, print, copy, or reveal secret values. Do not invoke quota-mutating RPCs during a catalog audit. Do not spend on OpenAI or paid infrastructure without explicit cost authorization.
- Do not merge draft PRs just because isolated CI is green. Never treat a local/disposable database test as hosted authorization proof.
- Prefer tasks that can be completed with existing connected tools and no paid services; do not use Codex credits or external paid services without approval.

## 3. Immediate next steps, in order

1. **Preserve containment.** Confirm current `ai-plan` version 4 metadata/source read-only before any further hosted action. Keep `verify_jwt=true`; do not call OpenAI; do not change secrets. Current stub responds 503 for every POST and is safer than the old provider-enabled version.
2. **Version-control the current stub as a code-only, reviewable change.** Add the exact 23-line version-4 source and import-map file to a dedicated branch/PR with tests that assert every POST returns the fail-closed 503 and there is no provider URL/key/model/body use. This is a source-of-truth reconciliation, not authorization to redeploy; do not touch `main`, production, database schema, or secrets. Preserve exact source and bundle hashes in the PR body.
3. **Migration provenance reconciliation.** Continue read-only source/ledger comparisons and locate actual historical SQL blobs/deployment receipts. Do not “fix” the 74-row ledger by guessing from the 87 filenames. Need byte-level evidence and documented dispositions for the 41 missing source tuples, 22 same-name/version mismatches and 6 hosted-only names. The current tuple report is not enough to apply schema changes.
4. **Independent review.** Ask a truly independent security/database reviewer to review the published evidence and submit findings. PR review endpoints for #40, #43, #45, #46 and audit PR #3 returned zero submitted reviews in latest checks. Prior public invitations to `Farenhytee` and `eugenicum` were not converted to reviewer requests because the requester is not a repository collaborator. Do not grant repository collaborator permissions yourself without explicit authorization; no independent approval has been recorded.
5. **Reconcile the authoritative quota path across clients.** Flutter currently calls `/functions/v1/ai-plan` directly. The web API route has a separate reservation/consume/release path in `apps/web/lib/ai-usage.ts`, but the direct Flutter Edge path did not have a verified durable quota contract. Keep Edge fail-closed until an authoritative server-side path is chosen and reservation/settlement/idempotency/concurrency/unknown-outcome recovery tests cover both client paths.
6. **Only after independent review and exact authorization:** controlled Development tests, potentially one explicitly budget-authorized provider request, then password-reset email/callback flow using a test account, recovery/RPO/RTO and operational checks. No live paid-provider test is authorized currently.
7. **After all gates:** explicitly owner-approved merge/release. Billing/entitlements/webhooks remain unimplemented or unverified; public paid launch is NO-GO.

## 4. Current PR/issue map

All of the following PRs were most recently checked as **OPEN / Draft / Unmerged** unless noted:

- **PR #32 — AI planner integration**: HEAD `760ece48b899b17fed424c0839fc3c59e8e1c77b`, base `main`. Flutter uses a direct `ai-plan` Edge Function call. It does not prove hosted quota enforcement. [PR #32](https://github.com/abdalrhmanata-gif/Nexo/pull/32)
- **PR #40 — W83 anonymous AI RPC wrappers**: HEAD `3c9a9ab11a22c39ae270ff0ae1efea94e0627976`, base `zavqera/ai-planner-integration`. Isolated PostgreSQL 17/REST/pgTAP evidence is green, but hosted authorization/migration parity and live modern secret-key gateway behavior are not proven. Review candidate grant policy carefully. [PR #40](https://github.com/abdalrhmanata-gif/Nexo/pull/40)
- **PR #43 — W82 reservation identity SQL cleanup**: HEAD `51c3c911b9f7eda344067f1c7d804d8ab83d61ff`, base `zavqera/ai-planner-integration`. W21 exact-head isolated PostgreSQL 17/pgTAP/security/concurrency/browser E2E run and Flutter CI passed. It is not hosted parity, independent review or authorization to apply the migration. [PR #43](https://github.com/abdalrhmanata-gif/Nexo/pull/43)
- **PR #44 — explicit model configuration**: HEAD `3e39c3cd6aea415ada3dc37e43109dd71258cb14`, base PR #32. Draft; no release approval.
- **PR #45 — fail-closed AI Edge quota gate**: HEAD `dc793f160c978de6cb7da6ada0c4971bef82f160`, base PR #44. The earlier commit `7ee74ebdd58c6cbfadb0f6d6a5b7196505ab0aa6` passed AI Plan Function CI and Flutter CI. It was deployed as Development version 3 and read back as matching at that moment; the latest current read-back is the different **version-4 temporary stub**. Do not rely on the old v3 comment as current deployment status. [PR #45](https://github.com/abdalrhmanata-gif/Nexo/pull/45)
- **PR #46 — web auth/body-bounds/quota and Netlify preview workflow**: HEAD `5bdadd00785c4907841af18139ef3cad1e55758e`, base `zavqera/ai-planner-integration`. Web Unit, Web CI and Flutter CI succeeded at this exact SHA. Web Unit: 386 passed / 0 failed / 1 skipped (387 total). Local built-runtime smoke passed (`/` 200, `/auth/sign-in` 200, unauthenticated `POST /api/ai/plan` 401). Netlify workflow run #39721398233 attempt 2 failed at the missing-secret check; actual preview routes were never tested because no draft URL was created. Production deploy job was skipped. [PR #46](https://github.com/abdalrhmanata-gif/Nexo/pull/46) · [Netlify workflow](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39721398233)
- **PR #38 — read-only W66–W82 Development audit preflight refresh**: OPEN / Draft / Unmerged, latest checked HEAD `e79b89375366da416bb266547c3acf06d8bbff70`. The doc was refreshed and verified to contain the 2026-10-22 migration/function-state appendix. [PR #38](https://github.com/abdalrhmanata-gif/Nexo/pull/38)
- **PR #42 — paid billing boundary**: docs/contract only, no verified payment provider, webhooks or subscription lifecycle.
- **Issue #23 — Mission Authority / schema guardrail**: open; expressly prohibits hosted Development schema changes and hosted E2E until the approval boundary is explicitly superseded. [Issue #23](https://github.com/abdalrhmanata-gif/Nexo/issues/23)
- **Issue #31 — Release gate**: open; launch remains NO-GO, contains accumulated evidence and prior comments. A comment in that issue records the older v3 deployment; version 4 above supersedes it. [Issue #31](https://github.com/abdalrhmanata-gif/Nexo/issues/31)
- **Independent review intake** is in a separate audit repo: [Issue #4](https://github.com/abdalrhmanata-gif/nexo-w21-isolated-verification-20261015/issues/4). PR #2 merged audit artifacts only (not independent review); audit PR #3 is still draft and has no submitted review.

## 5. Netlify preview blocker and incident details

GitHub Actions repository secret `NETLIFY_AUTH_TOKEN` is absent. The preview workflow checks for it before the Netlify deploy call, so attempts fail without creating a draft. It cannot be created by currently available connected actions; the owner must add a Netlify personal access token in [GitHub Actions Secrets](https://github.com/abdalrhmanata-gif/Nexo/settings/secrets/actions), without sharing the value in chat. Then rerun the failed job. **Do not claim preview fixed until a real returned draft URL passes route checks.**

A prior production-context Netlify deployment did occur: deploy ID `6ad90185d5ab07705a7d1f67`, commit on `main` `3dfb18e0d1ca34f232a1e1d23921109e08d5477d`, state `ready`, no Functions/Edge Functions reported, root path gave 404. The final tree hash matched the pre-incident `main` tree, but the deployment event occurred. Do not say “no production deployment ever happened.” No current PR #46 production deploy was performed.

## 6. Secret handling and security observations

- A read-only Netlify environment listing unexpectedly returned an **unmasked Development-context value** for an ambiguous secret-scoped variable beginning `ZAVQERA_SERVER_DB_`. The value was not copied into source, issue comments, PR comments or logs and was not used. Its purpose is unconfirmed by source search. An owner should verify whether it is a live credential and rotate/remove it through approved secret management if needed. No secret value is reproduced here.
- Never repeat that value or re-read broad environment listings merely to inspect values.
- Supabase Auth leaked-password protection is disabled (WARN). Do not assume upgrade costs have been approved.
- Three private anonymous-AI tables were flagged by the Supabase advisor as RLS-disabled CRITICAL. Prior direct ACL checks did not confirm direct table privileges for `anon`, `authenticated`, or `service_role`, and catalog/function-path evidence did not establish a callable anon/authenticated path. This is an unresolved advisor/configuration discrepancy; neither ignore it nor blindly turn on RLS without a reviewed access design.
- The W82 migration candidate and hosted ledger/ACL evidence differ. In candidate source, relevant reservation/private helper functions grant `authenticated` EXECUTE in the migration; current/previous hosted records show a materially different effective privilege state. Independent review and explicit reconciliation required.
- No secret changes, migrations, database writes, quota-mutating RPCs, paid provider calls, production deployment or rollback were done in this handoff task.

## 7. Exact evidence links

- Supabase Development function state is represented by the most recent read-only function metadata in this conversation; version 4 details above.
- AI Plan Function CI for the earlier fail-closed source commit `7ee74eb`: [39474956527](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39474956527)
- Flutter CI for that same exact SHA: [39474956481](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39474956481)
- PR #46 Web Unit [39721398221](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39721398221)
- PR #46 Web CI [39721398249](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39721398249)
- PR #46 Flutter CI [39721398184](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39721398184)
- PR #46 Netlify workflow, latest observed attempt 2 failed for missing `NETLIFY_AUTH_TOKEN`: [39721398233](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39721398233)
- W82 isolated W21 candidate exact-head run: [39444539214](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39444539214)
- W83 isolated PostgreSQL 17 / REST / pgTAP run: [39408110610](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/39408110610)

## 8. How to continue in a new conversation

1. Upload this handoff file to the new conversation or start by saying: **“اقرأ ملف ZAVQERA Continuity Handoff 2026-10-23 باعتباره نقطة الاستئناف الأساسية. تحقّق من الوضع الحي قبل أي تغيير، ثم تابع الخطوة التالية الآمنة دون تكرار ما أُنجز.”**
2. First, re-read the current `ai-plan` function metadata/source and compare with version 4 noted here. Do not deploy automatically.
3. Create a reviewable code-only PR to put the exact current fail-closed stub into version control, if still absent, and make tests/evidence explicit.
4. Reconcile historical migration source bytes/receipts and pursue independent review. No database mutation until the Issue #23 guardrail has been explicitly superseded by a narrowly scoped written authorization.
5. Keep every PR Draft until its explicit gates pass. Do not merge, deploy Production or enable AI provider calls based only on green isolated CI.

## 9. Stable personal/project preferences relevant to execution

- The user prefers concrete actions, high precision, short progress/status messages and minimal final text.
- The user often requests autonomous step-by-step execution without repeated questions, but this does **not** override explicit safety/authorization gates for hosted schema, secrets, paid provider use, production or collaborator access.
- The user communicates in Arabic and Norwegian; for this technical project, Arabic status plus exact English technical identifiers/links is effective.
- Avoid external paid services and avoid consuming Codex credits unless explicitly authorized.

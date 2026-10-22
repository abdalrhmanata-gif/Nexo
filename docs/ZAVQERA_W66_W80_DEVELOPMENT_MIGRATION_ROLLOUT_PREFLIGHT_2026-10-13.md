# ZAVQERA W66–W82 hosted Development rollout preflight and recovery plan

**Prepared:** 2026-10-13  
**Reviewed branch:** `zavqera/ai-planner-integration`  
**Code/test candidate reviewed:** `be8b96bb7d5448125d0c4134fb6275f02950ff53`  
**Documentation refresh after that candidate:** `0be81936c42e52659b3f625fd7f28b159f43648f`  
**Scope:** read-only rollout planning only. This document does not authorize any hosted migration or live Research run.

## Decision

**Do not apply W66–W80 to hosted Development yet.** The isolated PostgreSQL 17 migration replay, W21 launch gate and companion checks are passing, but they do not make the hosted schema current. A read-only check on 2026-10-13 confirmed hosted Development still ends at W65. The host does not contain the budget tables or dispatch/reconciliation claim columns introduced later in this sequence, and it still has the legacy six-argument Research completion functions.

The ordered rollout intentionally revokes some old privileges and changes RPC signatures. W67 explicitly disables the old Research completion path until W79 installs the requester-bound trusted replacement. Treat that as a planned compatibility break: authenticated hosted Research must remain blocked throughout the partial rollout.

## Read-only hosted Development findings

Project: `mrwmmbytcymqgwvcoywd` (eu-west-1).

- `supabase_migrations.schema_migrations` inventory returned latest applied migration `20261011150000` / `w65_agent_execution_table_write_boundary`. W66–W80 do not appear in the hosted ledger.
- `public.mission_authority_budgets` and `public.mission_authority_budget_reservations` are absent.
- These `public.agent_executions` columns are absent: `dispatch_claimed_at`, `dispatch_claim_authority_hash`, `reconciliation_claimed_at`, `reconciliation_lease_expires_at`.
- The catalog query returned the old six-argument `complete_read_only_research_execution(uuid, text, jsonb, jsonb, text, text)` in both schemas. The seven-argument requester-bound W79 signature was not present in that result.
- The **public** six-argument function is SECURITY INVOKER; execution privileges were `anon=false`, `authenticated=true`, `service_role=true`.
- The **private** six-argument function is SECURITY DEFINER; execution privileges were `anon=false`, `authenticated=true`, `service_role=false`.

That last privilege result is a concrete reason to keep hosted Research blocked. W67 is intended to revoke all API-role execution on both legacy signatures. No DDL, grants, migration, hosted Research, or data write was performed during this inspection.

## Migration order and role of each change

Apply only in timestamp order. There is no W72 SQL migration in the repository sequence; W72 refers to gateway integration coverage using fake providers, not a schema version.

| Order | Migration | Purpose / rollout concern |
|---|---|---|
| 1 | W66 — `20261011160000` | Revokes direct `service_role` table privileges on `public.agent_executions`; trusted writes must go through the guarded RPC boundary. Check existing worker paths before rollout. |
| 2 | W67 — `20261011165000` | Revokes `PUBLIC`, `anon`, `authenticated`, and `service_role` execution on the legacy six-argument Research completion RPCs. Research is intentionally unavailable until the replacement is installed and verified. |
| 3 | W68 — `20261011170000` | Creates the authority-budget and budget-reservation tables, enables RLS, sets table/function privileges, and changes start/settlement handling to reserve and hold budget atomically. Existing RUNNING/UNKNOWN attempts and reservations need a read-only inventory before rollout. |
| 4 | W69 — `20261011180000` | Adds persisted dispatch-claim fields and a one-time JIT claim bound to current authority, approval, audience, version, lease and reservation. It grants the claim RPC to `service_role`; it does not itself call a provider. |
| 5 | W70 — `20261011190000` | Adds durable reconciliation claim/lease state and trusted reconciliation RPCs. Reconciliation is separate from dispatch; unknown outcomes must not be blindly resent. |
| 6 | W71 — `20261012070000` | Repairs stale RUNNING execution recovery so the reservation is held as unknown before reconciliation. Depends on W68 budget state and W70 reconciliation semantics. |
| — | W72 integration coverage | No W72 migration file is present. W21 exercises the persistent gateway with fake providers on a disposable database. Do not create or invent a migration to fill this numbering gap. |
| 7 | W73 — `20261012120000` | Adds tightly validated trusted SYSTEM mission events for execution workers that do not have `auth.uid()`. |
| 8 | W74 — `20261012130000` | Hardens reconciliation so authoritative evidence must be newer than the active reconciliation claim. |
| 9 | W75 — `20261012140000` | Defines the correlatable provider-receipt guard. A generic success status is not sufficient evidence. |
| 10 | W76 — `20261012150000` | Attaches the receipt guard on both INSERT and UPDATE of `agent_executions`. Future successful writes without a stable receipt reference should fail. |
| 11 | W77 — `20261012160000` | Bounds/allowlists authenticated read-only Research completion payloads. Research output is not external-action evidence. |
| 12 | W78 — `20261012170000` | Binds Research history/events to the exact durable execution and its persisted result/request/source fields. |
| 13 | W79 — `20261012180000` | Drops the legacy six-argument Research functions and creates a seven-argument requester-bound trusted completion boundary. Only `service_role` should execute the new public wrapper. This is an API contract break and must match the deployed route/preflight. |
| 14 | W80 — `20261013100000` | Adds NULL-safe fail-closed workspace-role checks across approval, invitation, budget and stale-recovery paths. Public invitation wrappers remain SECURITY INVOKER; private helper privileges are role-specific. |

The complete source for each migration remains authoritative. This table is an operator-facing dependency summary, not a replacement for reviewing the SQL and pgTAP tests.

## Preconditions before a separately authorized Development rollout

1. **Obtain explicit authorization for Development-only DDL** and agree that Research remains unavailable while W67 is in effect. This document is not that authorization. Never infer permission to modify Supabase Main/Production.
2. Take/verify an appropriate Development backup or restore point using an approved method. Record what data would be lost if restoration became necessary. Do not assume a single transaction spans the whole multi-migration rollout.
3. Confirm no concurrent migration or deploy operation is running. Capture the migration ledger and read-only catalog snapshot immediately before the rollout; stop if the ledger is not exactly the expected W65 baseline or if function/table state diverges from the preflight above.
4. Verify the branch's exact current local W21 replay and companion checks before starting. The candidate's existing W21 must remain green; do not bypass schema-signature preflight.
5. Inventory existing `agent_executions` that are RUNNING, UNKNOWN, stale, completed, or lack matching reservations/receipt references. Decide how each will be handled before changing their lifecycle contract. Do not fabricate reservations or success receipts to make the checks pass.
6. Confirm the matching web route code expects the requester-bound seven-argument Research completion signature and that the W79 schema preflight fails closed when that signature is absent.

## Controlled application and checkpoints

If and only if the owner separately authorizes the rollout:

- Apply each checked-in migration in timestamp order, one at a time, using the approved Supabase migration workflow. Do not apply W80 ahead of its predecessors, skip W67, create a W72 SQL migration, or mark a migration as applied by editing the ledger.
- After W66, verify the direct table-write boundary and confirm guarded service-role RPC paths still work in the reviewed environment.
- After W67, verify neither legacy six-argument Research signature is executable by `PUBLIC`, `anon`, `authenticated`, or `service_role`. Keep Research closed. Do not restore the legacy grants as a convenience workaround.
- After W68–W71, verify both budget tables and RLS, the new dispatch/reconciliation columns, expected RPC signatures and EXECUTE grants, and the relationship between stale executions and held reservations.
- After W73–W76, verify SYSTEM event restrictions, claim-freshness checks and receipt-trigger coverage for both INSERT and UPDATE.
- After W77–W79, verify only the intended seven-argument requester-bound completion signature remains, only `service_role` can execute its trusted wrapper, the private SECURITY DEFINER helper cannot be invoked by `authenticated`/anon, and Research history is bound to the current durable execution.
- After W80, verify missing workspace role is denied without state/history/activity changes, public invitation wrappers remain SECURITY INVOKER, and private helper EXECUTE grants match the intended lookup/create/accept/revoke roles.
- Finally, compare the actual ledger to the checked-in migration list through W80, run read-only function/table/column/privilege checks, inspect Security Advisor, and record the exact result. A green local W21 is not a substitute for those hosted postchecks.

Do not run hosted live Research, send a real invitation, register a real provider adapter, or perform a write-producing test as part of the migration itself. Those require separate authorization and appropriate test identities/secrets.

## Failure, rollback and recovery rules

- No reviewed down-migration set exists for W66–W80. Treat these changes as **forward-only by default**; do not improvise reverse GRANTs, recreate obsolete Research signatures, disable constraints/triggers, delete migration-ledger rows, or silently skip a version.
- If any migration fails, **stop before the next migration**. Capture the complete error and inspect the migration ledger and live catalog read-only to determine what actually committed. Do not blindly rerun the same migration until partial-application state is understood.
- Preserve fail-closed behavior: leave the provider adapter registry empty; keep Research blocked if the expected signature/privileges are not fully installed; do not bypass route preflight or directly mutate the execution ledger.
- Prefer a reviewed forward-fix migration plus disposable PostgreSQL 17 regression tests. If restoring the Development backup is judged necessary, first obtain explicit approval and disclose potential loss of any writes made since that restore point.
- After recovery, repeat the catalog and privilege checks and record the exact migration ledger. Do not treat a successful migration command alone as evidence of safe recovery.

## Remaining release decision

Hosted Development migration parity is **NOT VERIFIED / NOT APPLIED**. Authenticated hosted Research with persisted citations/history, real Resend inbox delivery, password-reset email/callback, manual desktop/mobile visual QA, leaked-password protection, and a real reviewed provider adapter remain separate gates. Universal Mission Authority enforcement across all relevant external side-effect paths remains **NOT PROVEN**.

PR #29 must remain OPEN / Draft / UNMERGED. This plan makes no change to hosted Development, Supabase Main/Production, Git `main`, deployment, DNS, billing, or any real-provider side effect.

## Fresh read-only hosted Development audit — 2026-10-14 17:50 UTC

This section supersedes any assumption that the 2026-10-13 snapshot alone is sufficient. The current connected project was queried read-only at **2026-10-14 17:50:16.867775+00**. Project ID: `mrwmmbytcymqgwvcoywd`; PostgreSQL 17.6; region `eu-west-1`. No database writes, DDL, grants, migration, or live Research request were performed.

### Current migration ledger and source delta

- Hosted `supabase_migrations.schema_migrations`: **74 rows**, latest version **`20261011150000` / W65**.
- The isolated source inventory reported **87 checked-in migration files**. All 16 checked-in migration files after W65 through W82 (W66–W71 and W73–W82; W72 has no SQL migration) remain unapplied on hosted Development.
- Result: migration parity is still **NOT VERIFIED / NOT APPLIED**. Do not infer parity from the successful disposable replay. The exact isolated W80 run is [here](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38608523334): PostgreSQL 17 replay through W80 exit 0; pgTAP **49 planned / 49 reported / 0 failed**; W81 and W82 replay exit 0; cleanup verified.

### Confirmed hosted schema gaps through W82

- `public.mission_authority_budgets` and `public.mission_authority_budget_reservations` are absent.
- `public.agent_executions` is missing the W69 dispatch-claim quartet: `dispatch_claimed_at`, `dispatch_claim_authority_hash`, `dispatch_claim_request_hash`, `dispatch_claim_budget_revision`.
- It is missing the three W70 reconciliation-claim fields queried in the repository contract: `reconciliation_claimed_at`, `reconciliation_lease_expires_at`, `reconciliation_claim_token`; and all W81 research-claim fields: `research_claimed_at`, `research_claim_request_hash`, `research_claim_authority_hash`, `research_claim_mission_version`.
- `public.ai_usage_reservations` exists with RLS enabled and a deny-direct-access policy, but the W82 identity columns `generation_kind` and `request_hash` are absent.
- The W81 `claim_read_only_research_execution(uuid, uuid, text)` signature was not found. The W82 `reserve_ai_generation(text, text, text)` signature was not found.

### Confirmed legacy executable paths and grant differences

- Both legacy six-argument `complete_read_only_research_execution(uuid, text, jsonb, jsonb, text, text)` functions still exist in `public` and `private`.
- Effective EXECUTE on the legacy public function is currently `authenticated=true`, `service_role=true`, `anon=false`. The private implementation is SECURITY DEFINER and currently has `authenticated=true`, `service_role=false`, `anon=false`. This is not the W67/W79 contract; keep hosted Research fail-closed.
- The legacy one-argument `reserve_ai_generation(text)` still exists in both `public` and `private`; catalog checks returned `authenticated=true` and `service_role=true`. W82's replacement signature is absent.
- The W66 table-write boundary is also absent in the current effective catalog: `service_role` currently has SELECT/INSERT/UPDATE/DELETE on `public.agent_executions`. Do not treat the local W66–W82 replay as proof those grants are fixed in hosted Development.

### RLS/security-advisor finding that needs separate review

Supabase's current table/advisory response flags RLS disabled (**CRITICAL**) on:
- `private.anonymous_ai_visitors`
- `private.anonymous_ai_ip_windows`
- `private.anonymous_ai_reservations`

The read-only catalog query confirmed RLS is disabled and found **no direct SELECT/INSERT/UPDATE/DELETE privileges for `anon`, `authenticated`, or `service_role` on those three tables**, and no `private` schema USAGE for `anon` (while `authenticated` has schema USAGE). The advisory wording says these tables are fully exposed, but the direct privilege check did not confirm direct table access for those roles. Record this as a critical configuration/advisory discrepancy requiring investigation, not as proof of direct public access and not as a reason to ignore the warning. There are no policies on these three tables in the current catalog result.

Do **not** blindly enable RLS without a reviewed policy/access design: enabling it with no policies may break intended internal operations. No remediation was applied.

A follow-up read-only function-call/ACL query at **2026-10-14 17:56:42.503374+00** found the public `reserve_anonymous_ai_generation`, `consume_anonymous_ai_generation`, and `release_anonymous_ai_generation` wrappers are SECURITY DEFINER but executable only by `service_role` (`anon=false`, `authenticated=false`). Their private helper implementations are not executable by those API roles either, and the catalog search found no other SQL function body calling these helpers. Therefore this catalog snapshot did **not** establish a callable anon/authenticated path into these tables. Keep the CRITICAL RLS advisory open as a defense-in-depth/configuration issue and investigate the Data API/application path before deciding on a policy change; this nuance is not a license to disregard the advisor.

Supabase Auth also currently reports `auth_leaked_password_protection` / **Leaked Password Protection Disabled** (WARN). The performance advisor lists 15 unused indexes; this is informational and should be judged against actual workload before any removal.

### Final required sequence additions

Continue in timestamp order after W80:
- **W81 — `20261014110000_w81_read_only_research_jit_claim.sql`**: add requester-bound single-use Research claim columns and RPCs, then verify that hosted routes stay blocked until the exact claim/completion contract and grants are present.
- **W82 — `20261014130000_w82_ai_generation_reservation_identity.sql`**: replace the one-argument AI reservation API with the three-argument request-identity contract and verify `generation_kind` / `request_hash`, privilege grants, and mismatched-retry behavior.

### Current approval boundary

The result remains **NO-GO for hosted Research and any Development migration**. The smallest owner decision required is explicit authorization for a **Development-only W66–W82 rollout** on project `mrwmmbytcymqgwvcoywd`, explicitly superseding the current Issue #23 schema-change restriction, with a reviewed backup/restore plan and a controlled migration window. Until that authorization exists, continue only with local tests, source review, and read-only checks. Never modify Supabase Main/Production, perform real provider effects, or register a provider adapter.


## Current hosted Development reconciliation and AI containment status — 2026-10-22

**Scope:** read-only Supabase metadata/function reads and GitHub source inventory. No SQL statement, RPC invocation, migration, secret read/write, provider request, or production action was performed for this refresh.

### Migration ledger comparison

- Live Development ledger: **74 migration rows**, latest `20261011150000 / w65_agent_execution_table_write_boundary`.
- Pinned candidate source snapshot: `zavqera/ai-planner-integration` at commit `1b02272a7281b2e9ebf9020cd21a8ac9de3e577e`, containing **87 checked-in SQL migration files**.
- Exact version + name tuple matches: **46**.
- Source tuples absent as exact tuples in the hosted ledger: **41**.
- Hosted tuples absent as exact tuples in the source snapshot: **28**; these comprise **22 same-name/different-version entries** and **6 hosted-only names**.
- All **16 source SQL migration files after W65 through W82** (W66–W71 and W73–W82; W72 has no SQL migration file in this snapshot) are absent from the hosted migration ledger. W81 and W82 therefore remain unapplied in the current ledger.

This is a version/name reconciliation only. It does **not** establish SQL-byte equality, the exact historical file that originally ran, or a deployment receipt. Do not “repair” the ledger or apply migrations based on tuple comparison alone.

### Current published `ai-plan` containment state

A fresh read-only recheck observed `ai-plan` **ACTIVE version 4**, `verify_jwt=true`, updated `2026-10-22T12:06:41.488Z`, reported bundle SHA-256 `245907cc77df7c5df142cc1ea89f26d930cfbb75e8a1c7b028b2a72abd52773f`.

The currently published source is a short temporary fail-closed stub (23 source lines):
- `OPTIONS` returns CORS preflight; non-POST methods return 405; every POST returns `503 ai_quota_enforcement_not_configured`.
- It makes no OpenAI/provider request, reads no provider secret, and does not parse the request body.
- JWT verification remains enabled at the function gateway.

This version is **more restrictive than a provider-enabled implementation**, which is the intended containment effect. However, its current deployed source differs from the source files in PR #45 / commit `7ee74ebdd58c6cbfadb0f6d6a5b7196505ab0aa6`; Supabase metadata/read-back did not identify who or what created version 4. Do not attribute this deployment to a particular actor without separate deployment audit evidence. Preserve fail-closed behavior and reconcile the deployed stub with version-controlled source in a reviewed, code-only change before future feature re-enablement. The earlier version-3 note is superseded by this current version-4 read-back.

### Static security review — findings, not independent approval

- PR #43 / W82 remains **OPEN / Draft / Unmerged**. It creates a requester-bound reservation API and adds request identity columns, but the source migration's grants and the historic hosted ACL records differ. In particular, the candidate grants `authenticated` EXECUTE on the public reservation wrapper and private helper functions. Before any hosted rollout, an independent reviewer must establish the intended direct RPC surface, `private` schema reachability, and the effective privileges under the actual Data API configuration.
- PR #40 / W83 remains **OPEN / Draft / Unmerged**. Its isolated PostgreSQL 17/pgTAP evidence is useful but does not prove hosted schema/grant parity or modern secret-key behavior against the live gateway.
- The direct Flutter Edge path remains blocked by the published version-4 stub. The web route's separate reservation/settlement implementation is not proof that the direct Flutter path is protected by the same authoritative quota.
- The latest Supabase security-advisor response returned `auth_leaked_password_protection` / **WARN: disabled**. This response does not supersede the previously recorded catalog-level RLS/ACL discrepancies; those require a fresh, scoped, authorized catalog capture and independent interpretation.

### Review and release decision

As of this refresh, direct GitHub review-submission checks returned **zero submitted reviews** for PRs #40, #43 and #45, and audit PR #3. The public independent-review intake has earlier invitations to `Farenhytee` and `eugenicum`, but no attributable independent review is recorded. The available actions in this execution do not grant repository collaborator access; no permissions were changed.

**NO-GO remains.** Issue #23 prohibits hosted Development schema changes and hosted E2E unless its approval boundary is explicitly superseded. Keep migrations W66–W82 unapplied, do not change secrets/ACLs, do not make a live-provider call, and do not promote this to Production. Next valid gate is independent review of the published evidence plus migration SQL-byte/deployment-receipt reconciliation; only then can an owner-authorized, separately reviewed Development change be evaluated.


### Independent reviewer assignment attempt — 2026-10-22

Formal GitHub review requests were attempted for `Farenhytee` and `eugenicum` on PRs #40 (W83), #43 (W82), and #45 (AI fail-closed). GitHub rejected the requests with HTTP 422: `Reviews may only be requested from collaborators`. A separate permission lookup returning `read` did not satisfy GitHub's collaborator requirement. The available GitHub actions do not expose a collaborator-invitation/write operation, so no membership or repository permissions were changed. The owner must invite an independent reviewer through repository access settings; after acceptance, request formal PR review again. Until a review is actually submitted, **independent review remains NOT DONE**.


### Targeted schema catalog confirmation — 2026-10-22 (read-only metadata)

A second scoped read-only metadata call listed **20 tables across `public` and `private`**, including columns and RLS flags. No table rows or secret values were read.

Confirmed on the live Development catalog:
- `public.ai_usage_reservations` has RLS enabled and 27 rows, but its columns currently omit `generation_kind` and `request_hash`; the visible `state` constraint remains `reserved/consumed/released` and does not include `unknown`. This corroborates that W82 is not applied.
- `public.mission_authority_budgets` and `public.mission_authority_budget_reservations` are absent.
- `public.agent_executions` (RLS enabled; 3 rows) lacks `dispatch_claimed_at`, `dispatch_claim_authority_hash`, `dispatch_claim_request_hash`, `dispatch_claim_budget_revision`, `reconciliation_claimed_at`, `reconciliation_lease_expires_at`, `reconciliation_claim_token`, and W81 research-claim fields.
- `private.anonymous_ai_visitors` (385 rows), `private.anonymous_ai_ip_windows` (384 rows), and `private.anonymous_ai_reservations` (386 rows) all report **RLS disabled**.

These RLS flags are a concrete defense-in-depth finding; they do **not**, by themselves, prove public table access. Prior ACL/catalog evidence reported no direct table privileges for `anon`, `authenticated`, or `service_role` on these private tables, but a current exact-ACL and exposed-schema/API-path capture is not available from this metadata call. Do not blindly enable RLS without reviewing intended server-side access and policies. The existing security-advisor output and catalog metadata must be adjudicated by an independent reviewer before any change.

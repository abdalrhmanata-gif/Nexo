# ZAVQERA read-only release-gate recheck — 2026-10-28

## Scope and safety

- Repository candidate: `zavqera/ai-planner-integration`, code HEAD `2abe1473ece7a01862d09ea74382c882de744d1f`.
- Supabase project checked: **ZAVQERA Development** (`mrwmmbytcymqgwvcoywd`), PostgreSQL 17.6.1, `ACTIVE_HEALTHY`.
- This is a read-only audit record. No SQL writes, migrations, edge-function deployment, secrets changes, production deploys, or PR merges were performed.
- The SQL catalog query was a SELECT-only supplemental check through the connected SQL tool. Its execution context was not proven transaction-read-only, so it is **not** a substitute for an approved read-only Management API capture or independent owner review.

## Findings verified on 2026-10-28

### 1. Repository migration history does not match hosted Development

Repository candidate contains 88 migration files; Development's ledger reports 74 rows and ends at `20261011150000_w65_agent_execution_table_write_boundary`.

Comparison by migration name/version:

- 46 have the same name and version.
- 22 have the same name but different timestamps/versions.
- 20 are present in the repository candidate but not in the hosted ledger.
- 6 appear in the hosted ledger but not in the repository candidate under the same name.

The 20 repository-only migrations include W66, W67, W68, W69, W70, W71, W73–W79, W80, W81, W82 and `pr29_workspace_member_mutation_authorization`. The 22 timestamp differences and six hosted-only names need historical SQL/provenance reconciliation; do not treat name similarity as proof of equivalent SQL.

The hosted public-schema inventory returned 17 tables and reported RLS enabled for all 17. It did not find `public.mission_authority_budgets` or `public.mission_authority_budget_reservations`. This is consistent with the missing W68 migration. The catalog lists `public.mission_verifications` and `public.mission_outcomes`, but table presence alone does not prove end-to-end outcome creation or verification.

### 2. The hosted quota RPC does not match the candidate web route

The deployed Development catalog exposes these `public` RPC signatures:

- `reserve_ai_generation(p_request_id text)`
- `consume_ai_generation(p_reservation_id uuid)`
- `release_ai_generation(p_reservation_id uuid)`
- `get_ai_usage()`

The candidate web route's `apps/web/lib/ai-usage.ts` calls `reserve_ai_generation` with three arguments: request ID, generation kind, and request hash. The three-argument contract is introduced by candidate migration W82, which is absent from the hosted ledger. Therefore the route cannot be considered quota-ready against the current Development schema; preserve the fail-closed behavior and do not remove request binding to make it appear functional.

The catalog output also showed `authenticated` EXECUTE privilege on the one-argument `public.reserve_ai_generation(text)` and private helper functions. This is supplemental catalog evidence only; the effective role/grant matrix still needs a secure, independently reviewed capture before any migration or RPC change.

### 3. Hosted Edge Function is deliberately disabled

- Function: `ai-plan`
- Status: `ACTIVE`, version 4, `verify_jwt=true`
- Reported bundle SHA-256: `245907cc77df7c5df142cc1ea89f26d930cfbb75e8a1c7b028b2a72abd52773f`
- The returned source is a temporary fail-closed stub: OPTIONS preflight, non-POST returns 405, every POST returns `503 ai_quota_enforcement_not_configured`. It does not call an AI provider.

Do not redeploy or re-enable provider calls until the authoritative quota reservation/settlement contract and deployed grants are reconciled.

### 4. Current project advisories

- Security advisor: `auth_leaked_password_protection` is `WARN` / disabled.
- Performance advisor: 15 unused-index INFO findings. Do not drop indexes solely from this warning; measure real workload first.

### 5. Candidate CI and deployment boundary

On code HEAD `2abe1473ece7a01862d09ea74382c882de744d1f`, GitHub's commit workflow lookup returned completed-success results for W21, W25, Web Unit, Web CI, Flutter CI, and the Netlify workflow. These are repository/isolated-test results; they do not prove hosted migration parity or live provider success.

The checked-in Netlify workflow at this HEAD uses `--context deploy-preview`, restricts the deploy job to allowlisted non-PR branch refs, and contains no `--prod` deployment flag. The separate PR preview job is distinct from deployment. This source inspection is not proof that a production deployment was made or that hosted live-provider tests passed.

## Release decision: NO-GO

Do not merge PR #29, apply W66–W82, change quota grants, or enable the AI Edge Function based on this audit alone.

Required release gates, in order:

1. Produce the approved secure read-only Management API/catalog capture and independently reconcile the 22 timestamp differences and six hosted-only migration names.
2. Review every intended migration in timestamp order and obtain explicit approval for the exact Development project and migration range.
3. In a disposable PostgreSQL 17 environment, prove the three-argument reservation wrapper, idempotency/request binding, quota races, settlement, and least-privilege grant matrix on one exact candidate SHA.
4. Only after separate authorization, apply the reviewed migration range to Development via the repository migration runner, then re-check ledger, effective grants, RLS and function signatures.
5. Deploy and test the matching application/Edge Function only after the deployed source SHA and schema contract are demonstrably aligned.
6. Obtain independent security review and explicit production release authorization.

No Production/Supabase Main change is authorized by this report.

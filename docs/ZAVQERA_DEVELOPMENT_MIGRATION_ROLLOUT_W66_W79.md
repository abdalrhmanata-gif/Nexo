# ZAVQERA Development migration rollout plan — W66 through W79

> **Superseded for baseline and rollout sequencing:** use [the 2026-10-14 historical migration reconciliation](ZAVQERA_HISTORICAL_MIGRATION_RECONCILIATION_2026-10-14.md). This earlier plan predates the read-only reconciliation; it is not rollout authorization. Development rollout remains **NO-GO** until the new report's history, W80 validation, and owner-authorization blockers are resolved.

Status: **PREPARED FOR REVIEW — NOT AUTHORIZATION TO APPLY**

Date: 2026-10-12  
Repository: `abdalrhmanata-gif/Nexo`  
Candidate branch: `zavqera/ai-planner-integration`  
Candidate code HEAD at preparation: `d22ccb9fd96251fc3a45295ff132b66f6b536268`  
Target project (Development only): `mrwmmbytcymqgwvcoywd` — `eu-west-1`

## 1. Why this runbook exists

A read-only catalog check on hosted Development found that its migration ledger ends at `20261011150000` (W65), while the candidate branch expects the W66/W68-W71/W73-W79 contract. The following required objects were absent: the two persistent authority-budget tables, the dispatch/reconciliation claim columns, and the requester-bound seven-argument Research completion RPC. The old six-argument public and private Research completion RPCs remain and currently grant EXECUTE to `authenticated`. W67 is added to revoke API-role access early in an authorized rollout; W79 later removes both old signatures.

The current application preflight deliberately fails closed when the new RPC signature is unavailable. Do not bypass this guard, send Research data to the provider, or describe hosted Research as ready while parity is unresolved.

This document is a review/runbook only. It does **not** authorize a migration, and no hosted schema change has been made.

## 2. Exact repository migration order

Apply only after a separate review/approval for hosted Development schema changes. Use the repository migration runner so the ledger and ordering remain authoritative; do not copy SQL fragments into the dashboard manually.

1. `20261011160000_w66_service_role_table_privilege_hardening.sql` — revoke direct `service_role` writes to the execution ledger; trusted RPCs remain the intended mutation boundary.
2. `20261011165000_w67_legacy_research_rpc_privilege_hardening.sql` — revoke API-role EXECUTE on both legacy six-argument Research completion functions immediately after W66, intentionally keeping Research unavailable until W79.
3. `20261011170000_w68_persistent_authority_budget_reservations.sql` — add persistent budget/reservation tables, RLS, guarded budget configuration and atomic execution-start reservation.
4. `20261011180000_w69_one_time_jit_dispatch_claim.sql` — add single-use dispatch-claim fields and the JIT claim function.
5. `20261011190000_w70_durable_unknown_outcome_reconciliation.sql` — add reconciliation claim/lease state and trusted reconciliation RPCs.
6. `20261012070000_w71_expired_external_execution_budget_recovery.sql` — preserve/hold external budget reservations when expired executions become UNKNOWN.
7. `20261012120000_w73_trusted_system_mission_events.sql` — allow only bounded, state-correlated trusted SYSTEM mission events.
8. `20261012130000_w74_reconciliation_claim_freshness.sql` — require reconciliation evidence to post-date the active claim.
9. `20261012140000_w75_correlatable_provider_receipt.sql` — require a stable correlatable provider reference on external success updates.
10. `20261012150000_w76_guard_external_success_on_insert.sql` — enforce the receipt invariant on both inserts and updates.
11. `20261012160000_w77_read_only_research_payload_bounds.sql` — bound and allowlist Research completion result/evidence payloads.
12. `20261012170000_w78_bind_research_history_to_execution.sql` — bind user-attributed Research history to the exact completed execution.
13. `20261012180000_w79_trusted_research_completion.sql` — remove the old user-callable completion signature and expose the requester-bound completion wrapper only to `service_role`.

W67 is an actual SQL migration in this candidate and must run immediately after W66 to revoke EXECUTE on the legacy public and private six-argument Research completion functions. W72 is covered by persistent gateway integration code/test, not by a SQL migration; do not invent a W72 migration-ledger row. Preserve timestamp order and use the repository's actual migration list as the source of truth.

## 3. Preconditions — all required before any hosted write

- [ ] A reviewer has examined this runbook, every migration in full, and the current hosted schema/ledger comparison.
- [ ] Confirm the selected project ID is exactly `mrwmmbytcymqgwvcoywd` (Development); stop if the project identity is unclear.
- [ ] Confirm Git branch/PR and candidate HEAD are still the reviewed versions; do not modify `main` or merge PR #29.
- [ ] Capture a fresh read-only migration-ledger and catalog snapshot immediately before rollout.
- [ ] Verify the isolated PostgreSQL 17 migration replay and pgTAP suite are green on the exact candidate HEAD.
- [ ] Verify W21, W25, Web Unit, Web CI and Flutter CI on the exact candidate HEAD. These prove candidate tests, not hosted schema parity.
- [ ] Review the change/rollback implications for any existing rows. W68 creates accounting tables and W69/W70 add execution state; do not assume a destructive down migration is safe.
- [ ] Have an authorized operator and a recovery window. Do not put credentials, access tokens, or database dumps in GitHub issues, PR comments, or chat.

**Stop conditions:** wrong project, unexpected migration version, missing prerequisite tables/functions, schema drift not covered by the reviewed migrations, any failed CI/pgTAP assertion, or uncertainty about a migration's effect. Do not attempt a partial/manual subset to make the preflight pass.

## 4. Required post-rollout read-only verification

After an explicitly approved migration rollout, verify all of the following from the hosted Development catalog and migration ledger:

- [ ] Latest ledger version equals the latest migration actually included by the approved rollout (expected W79 for this plan).
- [ ] `public.mission_authority_budgets` and `public.mission_authority_budget_reservations` exist, have RLS enabled, and are not directly writable by `anon`, `authenticated`, or `service_role`.
- [ ] `public.agent_executions` has the W69 dispatch claim fields and W70 reconciliation claim/lease/token fields.
- [ ] W67 has revoked API-role EXECUTE on the legacy public and private six-argument functions before the later rollout steps; Research remains intentionally unavailable until W79.
- [ ] The old signatures `public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)` and `private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)` are absent.
- [ ] The seven-argument signatures `public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)` and `private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)` exist.
- [ ] Only `service_role` can execute the public trusted wrapper; `anon` and `authenticated` cannot execute either completion implementation.
- [ ] The external-success receipt trigger exists for both INSERT and UPDATE.
- [ ] W68-W79 pgTAP/regression tests pass in an isolated database on the same migration set.

Catalog parity alone is not live Research verification. A separate opt-in authenticated test requires an approved Development test account, private non-production credentials, and permission to create persistent Mission/execution/history records. Do not run it automatically as part of migration rollout.

## 5. Rollback and recovery policy

- Do not issue a blanket `down` migration or manually drop the new tables/columns/functions.
- Before any rollout, the authorized operator must review the platform's recovery options and whether data written after rollout can be preserved.
- If a migration fails, stop immediately, retain the exact error privately, inspect the migration ledger and actual catalog, and determine whether the migration was transactional or partially applied before taking any further action.
- Prefer a separately reviewed forward-fix migration when state/data may have been written. Do not replay a migration blindly if the ledger and catalog disagree.
- If a post-rollout invariant fails, keep authenticated hosted Research blocked and investigate; never bypass the schema preflight or downgrade the completion boundary just to make the UI appear functional.

## 6. Current decision

**NOT APPLIED / AWAITING SEPARATE REVIEW AND AUTHORIZATION.** Hosted Development remains on W65 per the last read-only query. Supabase Main/Production, Git `main`, Production deployment, DNS, billing, and real provider side effects are out of scope. PR #29 remains OPEN / Draft / Unmerged.


## Additional finding from live privilege/function inspection — 2026-10-12

A further read-only privilege check confirmed that **both** hosted legacy six-argument functions are executable by `authenticated`: the public wrapper and the private implementation. The public wrapper itself is not `SECURITY DEFINER`, but the private implementation is `SECURITY DEFINER`; `anon` cannot execute either, while `authenticated` can directly execute the private implementation as well as the public wrapper. This means the direct private grant is not merely an indirect call path. The old implementation binds completion to the caller's own editable workspace and a read-only research execution, but it has weaker payload allowlisting than W77 and permits the authenticated completion path that W79 removes. Therefore the current hosted mismatch is also a **research-integrity gap**, not just a route-availability issue: a signed-in user with a suitable RUNNING research execution could submit fabricated unverified completion content through either legacy function, subject to the older checks.

The current branch's new route preflight fails closed before quota reservation and provider I/O when the seven-argument RPC is missing; this does not revoke the old hosted RPC's direct privilege. Do not try to remediate this by making an unreviewed hosted privilege change. Treat hosted Research as blocked until the separately reviewed W66-W79 rollout (or another explicitly reviewed mitigation) is authorized and its grants/function signatures are verified. No live privilege was changed during this check. The exact read-only query observed: legacy public exists; `authenticated` EXECUTE on legacy public = true; `authenticated` EXECUTE on legacy private = true; `anon` EXECUTE on either = false; legacy private is `SECURITY DEFINER`; latest hosted migration remains W65.

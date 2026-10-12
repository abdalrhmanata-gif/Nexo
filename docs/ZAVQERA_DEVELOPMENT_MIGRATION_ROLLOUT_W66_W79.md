# ZAVQERA Development migration rollout plan — W66 through W79

Status: **PREPARED FOR REVIEW — NOT AUTHORIZATION TO APPLY**

Date: 2026-10-12  
Repository: `abdalrhmanata-gif/Nexo`  
Candidate branch: `zavqera/ai-planner-integration`  
Candidate code HEAD at preparation: `d22ccb9fd96251fc3a45295ff132b66f6b536268`  
Target project (Development only): `mrwmmbytcymqgwvcoywd` — `eu-west-1`

## 1. Why this runbook exists

A read-only catalog check on hosted Development found that its migration ledger ends at `20261011150000` (W65), while the candidate branch expects the W66/W68-W71/W73-W79 contract. The following required objects were absent: the two persistent authority-budget tables, the dispatch/reconciliation claim columns, and the requester-bound seven-argument Research completion RPC. The old six-argument public Research completion RPC remains.

The current application preflight deliberately fails closed when the new RPC signature is unavailable. Do not bypass this guard, send Research data to the provider, or describe hosted Research as ready while parity is unresolved.

This document is a review/runbook only. It does **not** authorize a migration, and no hosted schema change has been made.

## 2. Exact repository migration order

Apply only after a separate review/approval for hosted Development schema changes. Use the repository migration runner so the ledger and ordering remain authoritative; do not copy SQL fragments into the dashboard manually.

1. `20261011160000_w66_service_role_table_privilege_hardening.sql` — revoke direct `service_role` writes to the execution ledger; trusted RPCs remain the intended mutation boundary.
2. `20261011170000_w68_persistent_authority_budget_reservations.sql` — add persistent budget/reservation tables, RLS, guarded budget configuration and atomic execution-start reservation.
3. `20261011180000_w69_one_time_jit_dispatch_claim.sql` — add single-use dispatch-claim fields and the JIT claim function.
4. `20261011190000_w70_durable_unknown_outcome_reconciliation.sql` — add reconciliation claim/lease state and trusted reconciliation RPCs.
5. `20261012070000_w71_expired_external_execution_budget_recovery.sql` — preserve/hold external budget reservations when expired executions become UNKNOWN.
6. `20261012120000_w73_trusted_system_mission_events.sql` — allow only bounded, state-correlated trusted SYSTEM mission events.
7. `20261012130000_w74_reconciliation_claim_freshness.sql` — require reconciliation evidence to post-date the active claim.
8. `20261012140000_w75_correlatable_provider_receipt.sql` — require a stable correlatable provider reference on external success updates.
9. `20261012150000_w76_guard_external_success_on_insert.sql` — enforce the receipt invariant on both inserts and updates.
10. `20261012160000_w77_read_only_research_payload_bounds.sql` — bound and allowlist Research completion result/evidence payloads.
11. `20261012170000_w78_bind_research_history_to_execution.sql` — bind user-attributed Research history to the exact completed execution.
12. `20261012180000_w79_trusted_research_completion.sql` — remove the old user-callable completion signature and expose the requester-bound completion wrapper only to `service_role`.

There are no W67 or W72 SQL migration files in this candidate migration list; W72 is covered by the persistent gateway integration code/test, not by inventing a missing migration. Preserve timestamp order and use the repository's actual migration list as the source of truth.

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

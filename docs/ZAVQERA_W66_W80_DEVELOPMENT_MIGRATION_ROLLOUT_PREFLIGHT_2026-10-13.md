# ZAVQERA W66–W80 hosted Development rollout preflight and recovery plan

> **Superseded for baseline and rollout sequencing:** use [the 2026-10-14 historical migration reconciliation](ZAVQERA_HISTORICAL_MIGRATION_RECONCILIATION_2026-10-14.md). This earlier plan predates the read-only reconciliation; it is not rollout authorization. Development rollout remains **NO-GO** until the new report's history, W80 validation, and owner-authorization blockers are resolved.

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

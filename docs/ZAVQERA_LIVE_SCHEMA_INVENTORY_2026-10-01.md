# ZAVQERA live schema inventory — 2026-10-01

**Target:** ZAVQERA Development (`mrwmmbytcymqgwvcoywd`)  
**Method:** Read-only catalog queries through Supabase SQL API. No row data queried, exported, changed, or copied.  
**Purpose:** Pre-production schema review input; **not** a migration or production-ready dump.

## Live inventory

- PostgreSQL: 17.6.1.166; project region: `eu-west-1`; status: `ACTIVE_HEALTHY`.
- Application-owned `public` tables (7): `profiles`, `workspaces`, `missions`, `mission_actions`, `mission_events`, `mission_verifications`, `mission_outcomes`.
- RLS: enabled on all 7 tables; `FORCE ROW LEVEL SECURITY` is false on all 7.
- RLS policies: 18, scoped to `authenticated`; no `anon` or `PUBLIC` table grants were returned by the read-only grant inventory.
- Triggers: 13 across the seven tables, including updated-at triggers, action-insert/completion guard, action reparent/delete-history guards, and append-only guards for event/verification/outcome history.
- Public-schema functions: 9. All catalogued functions are `SECURITY DEFINER`; the five public mutation RPCs have pinned `search_path=pg_catalog, public`. The auth profile hook uses `public, pg_catalog`.
- Extensions observed: `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`.
- Index inventory: primary/unique keys plus mission ownership/workspace, action mission/position/follow-up, and history owner/mission timestamp indexes. Full index definitions remain available from the live catalog; no index was changed.

## Security review notes — must be resolved or explicitly accepted before production

1. All seven tables have RLS enabled but not forced. Review this against the intended table-owner/service-role threat model and verify the production role ownership model; do not blindly enable FORCE RLS because SECURITY DEFINER owners and triggers must be tested.
2. Direct authenticated table grants include `INSERT/DELETE/SELECT` on `mission_actions`, `INSERT/DELETE/SELECT` on `missions`, and `INSERT/DELETE/SELECT/UPDATE` on `workspaces`; policies constrain ownership, and trigger/history guards exist. Keep the live policy/grant definitions in the production review.
3. Five intentional signed-in `SECURITY DEFINER` RPCs appear as Supabase Security Advisor warnings. Review their body, ownership checks, fixed search path and execute grants individually; the warning is not itself proof of a vulnerability.
4. Leaked-password protection remains disabled (Pro+ setting per current project plan). Recheck after a plan change.
5. The migration registry currently ends at W21 `20261001091146`; repository migration replay is known to be incomplete. Do not generate a production migration by blindly replaying repository history.

## Production snapshot gate

Before exporting anything, review the CLI's schema-only dump behavior and exclusion list. Use an isolated local stack, exclude Development data, custom roles and managed Supabase schemas, and include only the specifically reviewed application auth hook. Verify the snapshot hash and object inventory before using it. Never use this document as a substitute for the reviewed SQL artifact.

## Execution status

- [x] Read-only table/RLS/policy/grant/trigger/function/extension/index/column/constraint inventory captured.
- [x] Cross-checked project status, migration registry, and Security Advisor.
- [ ] Snapshot generated and independently reviewed.
- [ ] Disposable local stack started and schema loaded.
- [ ] Authenticated two-user browser E2E passed with verified teardown.

The final three items remain **BLOCKED / NOT EXECUTED** in this environment: the repository is not mounted here and Docker/Supabase CLI are not installed. No remote schema was modified to work around that limitation.

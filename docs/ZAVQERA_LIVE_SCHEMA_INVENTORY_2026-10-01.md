# ZAVQERA live schema inventory — 2026-10-01

**Target:** ZAVQERA Development (`mrwmmbytcymqgwvcoywd`)  
**Method:** Read-only catalog queries through Supabase SQL API. No row data queried, exported, changed, or copied.  
**Purpose:** Pre-production schema review input; **not** a migration or production-ready dump.

## Live inventory

- PostgreSQL: 17.6.1.166; project region: `eu-west-1`; status: `ACTIVE_HEALTHY`.
- Application-owned `public` tables (7): `profiles`, `workspaces`, `missions`, `mission_actions`, `mission_events`, `mission_verifications`, `mission_outcomes`.
- RLS: enabled on all 7 tables; `FORCE ROW LEVEL SECURITY` is false on all 7.
- RLS policies: 18, scoped to `authenticated`; no `anon` or `PUBLIC` table grants were returned by the read-only grant inventory.
- Triggers: 13 across the seven application tables, including updated-at triggers, action-insert/completion guard, action reparent/delete-history guards, and append-only guards for event/verification/outcome history.
- Public-schema functions: 9. The five signed-in mutation RPCs are `SECURITY DEFINER`, use `search_path=pg_catalog, public`, require `auth.uid()` and owner checks, and use row locks for versioned transitions. The trigger actually attached to `auth.users` calls `private.handle_new_user_profile()`; its search path is `pg_catalog`.
- A second `public.handle_new_user_profile()` function also exists. It is not the function attached to `auth.users`; its EXECUTE ACL excludes `PUBLIC`, `anon` and `authenticated`. Treat this as a duplicate/cleanup candidate only after separate migration review; no change was made.
- Function ACL inventory: all nine public functions deny EXECUTE to `PUBLIC` and `anon`; only the five intended signed-in RPCs grant EXECUTE to `authenticated`. Trigger/internal functions are not directly executable by authenticated users.
- Extensions observed: `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`.
- Index inventory: primary/unique keys plus mission ownership/workspace, action mission/position/follow-up, and history owner/mission timestamp indexes. No index was changed.

## Security review notes — must be resolved or explicitly accepted before production

1. All seven tables have RLS enabled but not forced. Review this against the intended table-owner/service-role threat model and verify production role ownership; do not blindly enable FORCE RLS because SECURITY DEFINER owners and triggers must be tested.
2. Direct authenticated table grants include `INSERT/DELETE/SELECT` on `mission_actions`, `INSERT/DELETE/SELECT` on `missions`, and `INSERT/DELETE/SELECT/UPDATE` on `workspaces`; policies constrain ownership. `mission_actions` has an UPDATE policy but no direct authenticated UPDATE table grant, consistent with updates going through the authoritative RPC.
3. Five signed-in `SECURITY DEFINER` RPCs appear as Supabase Security Advisor warnings. Read-only body review confirms authentication/ownership checks on these mutation RPCs, fixed search paths, and row locks on versioned state changes. This is static review, not concurrency/E2E proof.
4. The `auth.users` trigger targets `private.handle_new_user_profile()`. Ensure any schema snapshot preserves the `private` function and this trigger binding; do not substitute the duplicate public function or dump managed Auth tables.
5. Leaked-password protection remains disabled (Pro+ setting per current project plan). Recheck after a plan change.
6. The migration registry currently ends at W21 `20261001091146`; repository migration replay is known to be incomplete. Do not generate a production migration by blindly replaying repository history.

## Production snapshot gate

Before exporting anything, review the CLI's schema-only dump behavior and exclusion list. Use an isolated local stack, exclude Development data, custom roles and managed Supabase schemas, and include the specifically reviewed `private.handle_new_user_profile()` plus the `auth.users` trigger binding. Verify the snapshot hash and object inventory before using it. Never use this document as a substitute for the reviewed SQL artifact.

## Execution status

- [x] Read-only table/RLS/policy/grant/trigger/function/extension/index/column/constraint inventory captured.
- [x] Function definitions, ACLs, and actual `auth.users` trigger target checked read-only.
- [x] Cross-checked project status, migration registry, and Security Advisor.
- [ ] Snapshot generated and independently reviewed.
- [ ] Disposable local stack started and schema loaded.
- [ ] Authenticated two-user browser E2E passed with verified teardown.

The final three items remain **BLOCKED / NOT EXECUTED** in this environment: the repository is not mounted here and Docker/Supabase CLI are not installed. No remote schema was modified to work around that limitation.

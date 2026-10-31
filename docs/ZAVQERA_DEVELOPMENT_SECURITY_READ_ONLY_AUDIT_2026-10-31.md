# ZAVQERA Development — Security and Migration Provenance Audit

**Audit date:** 2026-10-31  
**Project:** ZAVQERA Development (mrwmmbytcymqgwvcoywd)  
**Region / engine:** eu-west-1, PostgreSQL 17.6.1.166  
**Project status:** ACTIVE_HEALTHY  
**Change scope:** Management metadata reads and SELECT-only catalog inspection. No schema, row, grant, RLS, Auth, secret, or project-setting mutation was performed.

## Executive result

Three independent facts must not be conflated:

1. Supabase's Security Advisor reports a **CRITICAL RLS-disabled** finding for three private.anonymous_ai_* tables. RLS is disabled, so there is no row-policy backstop if table grants or schema/API exposure change in future.
2. A supplemental catalog query observed no direct table privileges for anon, authenticated, or service_role on those three tables; anon also lacked schema USAGE. Public RPC wrappers appeared to grant EXECUTE only to service_role. However, the SQL connector session was current_user=postgres, session_user=postgres, and transaction_read_only=off. This was **not a qualifying secure read-only-session capture** and cannot close the security gate or prove the effective REST/API boundary. The advisor's claim of direct exposure is therefore neither confirmed nor safely dismissed.
3. Migration identity provenance is materially divergent. The hosted ledger and checked-in candidate histories differ by exact version/name tuples; matching labels alone do not establish historical SQL byte equality.

**Release remains NO-GO.** Do not repair the migration ledger, replay the migration directory, or apply the RLS proposal to hosted Development/Main based on this audit.

## Migration provenance — full pinned metadata comparison

A previously saved full reconciliation (2026-10-17) compared the hosted Development ledger with the pinned repository snapshot:

- Hosted ledger: **74 rows**, newest 20261011150000 / w65_agent_execution_table_write_boundary.
- Checked-in SQL migration files: **89** at branch codex/migration-ledger-provenance-20261015, exact tested HEAD c52be5442277eacfc3f25a0112d17cca7400f088.
- Exact same (version, name) tuples: **46**.
- Same migration name but different version/timestamp: **22**.
- Hosted-only migration names: **6**.
- Checked-in-only migration names: **21**.

The 22 version conflicts include W4, W7–W10, W16, W30, W36, W41–W51. Hosted-only names include expose_anonymous_ai_guard_rpc, w35_plan_ai_allowances_5_50_300, w44_workspace_invitations_and_activity, and w46_invitation_activity_bindings. Checked-in-only names include W66–W84.

A separate current PR #39 branch snapshot at 9d752a59f0683ea7149633138dc85bb33cf9a41b contains W66–W82 SQL migration files. This is a different branch and must not be conflated with the pinned 89-file reconciliation above.

**Interpretation:** this establishes identity/ledger drift only. It does not prove that any checked-in SQL is identical to historical SQL that was applied to Development, nor that every later candidate object is absent from the live schema. Out-of-band changes and hosted-only source migrations may exist. Do not use supabase db push, migration repair, or filename-based replay to force counts to match.

## Anonymous AI quota tables — observed state and limitations

| Table | Supabase Advisor | Supplemental catalog observation |
|---|---:|---|
| private.anonymous_ai_visitors | RLS disabled — CRITICAL | RLS disabled; no direct SELECT/INSERT/UPDATE/DELETE observed for anon, authenticated, or service_role |
| private.anonymous_ai_ip_windows | RLS disabled — CRITICAL | RLS disabled; no direct SELECT/INSERT/UPDATE/DELETE observed for anon, authenticated, or service_role |
| private.anonymous_ai_reservations | RLS disabled — CRITICAL | RLS disabled; no direct SELECT/INSERT/UPDATE/DELETE observed for anon, authenticated, or service_role |

The supplemental catalog query also observed:

- anon had no schema USAGE on private.
- authenticated had schema USAGE, but no direct table privileges and no EXECUTE on the private helper functions.
- service_role had schema USAGE, but no direct table privileges.
- Private helpers reserve_anonymous_ai_generation, consume_anonymous_ai_generation, and release_anonymous_ai_generation were SECURITY DEFINER, owned by postgres, and did not grant EXECUTE to anon, authenticated, service_role, or PUBLIC.
- Public wrapper definitions were SECURITY DEFINER, owned by postgres, and the supplemental ACL query showed EXECUTE granted to service_role only.
- current_setting('pgrst.db_schemas', true) returned null in that SQL session; the effective PostgREST exposed-schema configuration was **not verified**.

**Evidence qualification:** these ACL/function observations came from SELECT-only statements, but the connector session was postgres/postgres with transaction_read_only=off. They are supplementary observations, not an approved read-only privilege capture. The query did not alter rows or schema, but it does not replace the required dedicated read-only identity and read-only transaction gate. Do not assert that direct API exposure is conclusively absent or that it is conclusively exploitable from this result.

## Prior secure audit status

The saved 2026-10-15 review recorded an earlier eight-query catalog/ledger capture under supabase_read_only_user, with transaction_read_only=true, no superuser/create-role/create-database privileges, and a blocked result due to migration mismatch. That review still lacked the required query_13.json and explicitly did not constitute a complete 13-query capture. It also documented that the role had rolbypassrls=true and pg_read_all_data membership; keep its query scope limited to catalog/ledger data.

No complete, current 13-query capture has been supplied in this audit.

## RPC definitions and intended access path

The supplemental pg_get_functiondef output showed the three public wrappers delegating to the corresponding private helper functions, with pinned search paths and SECURITY DEFINER execution. The helper functions update/insert the private quota tables through fixed statements (not dynamic SQL). This supports the apparent design intent of server-side RPC mediation rather than browser table access.

The application repository uses ZAVQERA_SERVER_DB_KEY in server-side code without a NEXT_PUBLIC_ prefix. This audit did not inspect or disclose any secret value and did not verify the key's active role/identity. Confirm through approved secret metadata and a controlled non-provider test that the runtime key maps to the expected service_role wrapper grants and is never sent to a browser.

## RLS hardening proposal — not applied

Supabase's advisor proposed:

~~~sql
ALTER TABLE "private"."anonymous_ai_visitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."anonymous_ai_ip_windows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."anonymous_ai_reservations" ENABLE ROW LEVEL SECURITY;
~~~

**This SQL was not executed.** No policies were added and no privileges were changed. Do not apply it to Development/Main until a disposable PostgreSQL 17/Supabase proof is complete.

Before any hosted change:

1. Recreate the exact tables, ACLs, roles, wrappers, and function ownership in a disposable PostgreSQL 17/Supabase environment.
2. Enable RLS on the three tables in that disposable environment only, initially with no permissive policies.
3. Prove that the service-role public wrappers continue to reserve, consume, and release correctly under normal, concurrent, retry, and error cases.
4. Prove anon/authenticated cannot access table data or execute wrappers through direct SQL or REST/PostgREST.
5. Verify the public-schema wrapper owner, function search paths, BYPASSRLS assumptions, and the actual ZAVQERA_SERVER_DB_KEY role without exposing the key.
6. Confirm PostgREST exposed-schema configuration using an approved read-only capture.
7. Generate a canonical migration via the Supabase CLI workflow, review the SQL and migration provenance, run the isolated tests/advisors, and request separate approval before any hosted Development change.

Do not invent permissive policies for hashed visitor/IP records. The expected access model appears to be service-only RPC mediation, but policy choice must follow the disposable proof and independent review.

## Other advisor findings

- auth_leaked_password_protection: **WARN**, disabled. No Auth change was made.
- Performance advisor: 15 unused-index INFO findings. Do not drop indexes based on one usage snapshot; assess query plans and workload history first.

## Release impact

- Migration provenance / hosted schema parity: **NOT VERIFIED / NO-GO**.
- Anonymous quota-table RLS: **DISABLED / CRITICAL HARDENING GAP**.
- Direct ACL evidence: **supplementary only**, not a qualifying read-only security capture.
- PostgREST exposed-schema configuration: **UNKNOWN**.
- Leaked-password protection: **WARN**.
- No hosted migration, SQL write, grant, policy, RLS, Auth, key, Production, or Main change was made.

This audit is read-only in intent and makes no authorization for migration replay, hosted schema changes, provider activation, billing activation, deployment, or release.

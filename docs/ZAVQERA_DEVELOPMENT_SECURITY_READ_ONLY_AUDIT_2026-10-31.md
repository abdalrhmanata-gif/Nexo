# ZAVQERA Development — Read-only security and migration provenance audit

**Audit date:** 2026-10-31  
**Project:** ZAVQERA Development  
**Project reference:** `mrwmmbytcymqgwvcoywd`  
**Audit mode:** Management metadata reads and catalog-only `SELECT` queries. No schema, row, grant, RLS, Auth, secret, or project setting was changed.

## Executive result

Two different findings must remain separate:

1. Supabase's advisor reports a **CRITICAL RLS-disabled** finding for three `private.anonymous_ai_*` tables. RLS is disabled and therefore missing as a defense-in-depth layer.
2. A direct PostgreSQL catalog check did **not** confirm the advisor's statement that `anon` and `authenticated` can directly read or mutate these tables. The current schema and table ACLs deny those direct operations. The intended anonymous quota path is through server-only, service-role RPC wrappers.

A third independent release blocker is migration provenance: the hosted Development migration ledger and the repository candidate migration history do not match. Do not apply repository migrations to Development/Main until the sequence and schema parity have been reconciled.

## Project and migration ledger

The project metadata read returned:

- Status: `ACTIVE_HEALTHY`
- Region: `eu-west-1`
- PostgreSQL: `17.6.1.166` (engine major 17)

The hosted Development ledger contained **74 migration records** and ended at:

- `20261011150000 — w65_agent_execution_table_write_boundary`

The hosted ledger also contains `20261007105825 — expose_anonymous_ai_guard_rpc`. That migration file was not present in the inspected PR #39 repository tree.

Conversely, the PR #39 candidate tree contains the following later migration files, which are not represented in the hosted Development migration ledger returned by this audit:

- W66–W71: service-role privilege hardening, legacy RPC privilege hardening, persistent authority budget reservations, one-time JIT dispatch claim, durable UNKNOWN reconciliation, and expired external-execution budget recovery.
- W73–W79: trusted system mission events, reconciliation freshness, correlatable provider receipt, external-success insert guard, bounded research payload, research-history binding, trusted research completion.
- W80–W82: fail-closed workspace role checks, read-only research JIT claim, AI reservation identity.

The repository tree has no W72 migration file in this range.

**Interpretation:** this establishes ledger/repository divergence, not that every listed schema object is absent from Development. Out-of-band changes or other provenance sources may exist. No automatic repair or migration replay is safe until canonical migration sources, checksums, dependencies, and actual catalog state are reconciled.

## Anonymous AI quota tables — observed state

| Table | RLS enabled | Observed role privileges |
|---|---:|---|
| `private.anonymous_ai_visitors` | No | No direct SELECT/INSERT/UPDATE/DELETE for anon, authenticated, or service_role |
| `private.anonymous_ai_ip_windows` | No | No direct SELECT/INSERT/UPDATE/DELETE for anon, authenticated, or service_role |
| `private.anonymous_ai_reservations` | No | No direct SELECT/INSERT/UPDATE/DELETE for anon, authenticated, or service_role |

The catalog-only check returned:

- `anon` has no `USAGE` on schema `private`.
- `authenticated` has schema `USAGE`, but no direct table privileges on the three tables and no execute rights on the private helper functions.
- `service_role` has schema `USAGE`, but no direct table privileges on the three tables.
- The three private helper functions (`reserve_anonymous_ai_generation`, `consume_anonymous_ai_generation`, `release_anonymous_ai_generation`) are `SECURITY DEFINER`, owned by `postgres`, and do not grant EXECUTE to anon, authenticated, service_role, or PUBLIC.

The catalog also showed public-schema wrappers for the three RPC operations. They are `SECURITY DEFINER`, owned by `postgres`, and grant EXECUTE to `service_role` only; anon, authenticated, and PUBLIC do not have EXECUTE. Repository server code calls these endpoints through a server-only `ZAVQERA_SERVER_DB_KEY` and does not place that key in browser code.

This means the advisor's broad phrase “fully exposed to anon and authenticated” is **not confirmed by current schema/table/function ACLs**. The direct table path is denied by grants, and anon additionally lacks schema usage. Do not describe these rows as currently public data exposure without new evidence.

However, RLS remains disabled. It is a critical hardening gap because a later grant, role change, schema exposure change, or new client path could create direct access without a row-policy backstop. The linter should remain open until the boundary is hardened and regression-tested.

## Safe remediation direction — proposal only, not applied

Supabase's advisor proposed:

```sql
ALTER TABLE "private"."anonymous_ai_visitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."anonymous_ai_ip_windows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."anonymous_ai_reservations" ENABLE ROW LEVEL SECURITY;
```

**This SQL was not executed.** No policies were added and no privileges were changed.

Before any hosted change:

1. Reproduce the exact tables, ACLs, roles, wrappers, and function ownership in a disposable PostgreSQL 17/Supabase stack.
2. Apply the RLS enablement only in that disposable stack.
3. Prove that service-role wrapper calls still reserve, consume, and release correctly under concurrency and failure/retry conditions.
4. Prove anon/authenticated cannot access tables or invoke wrappers, including via REST/PostgREST.
5. Confirm the intended service credential identity and that `ZAVQERA_SERVER_DB_KEY` is server-only and not browser-exposed.
6. Generate a canonical migration from the agreed source using the Supabase CLI workflow, review it, and run advisors and tests before asking for any hosted Development change.

Do not invent permissive policies for hashed visitor/IP records. The intended access model appears to be service-only RPC mediation; policies must be chosen only after the disposable proof and role/grant review. Never replay the repository migration directory wholesale onto Development or Main.

## Other advisor findings

- Security advisor: `auth_leaked_password_protection` — **WARN**, disabled. This was not changed.
- Performance advisor: 15 unused-index INFO findings. Do not drop indexes from a single usage snapshot; assess query plans and workload history first.

## Release impact

- Development schema/migration provenance: **NOT VERIFIED / NO-GO**.
- Anonymous quota-table direct grants: denied for anon/authenticated in the catalog snapshot.
- Anonymous quota-table RLS: **NOT ENABLED / CRITICAL HARDENING GAP**.
- Leaked-password protection: **WARN**.
- No hosted migration, SQL write, grant, policy, RLS, Auth, key, Production, or Main change was made.

This audit is read-only evidence. It does not authorize migration replay, hosted schema changes, provider activation, billing activation, or release.

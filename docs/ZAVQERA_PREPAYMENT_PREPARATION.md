# ZAVQERA pre-payment preparation

**Date:** 2026-10-01  
**Status:** Safe preparation completed; no payment or infrastructure mutation performed.

## Confirmed read-only evidence

- Authorized database inspected: **ZAVQERA Development**, project ref `mrwmmbytcymqgwvcoywd`, region `eu-west-1`, PostgreSQL 17.6.1.166, status `ACTIVE_HEALTHY`.
- Development migration registry contains W18 `20260929182538`, reconciled W20 `20261001081755`, and W21 `20261001091146`. No migration was applied during this preparation.
- Read-only live catalog inventory now committed at [ZAVQERA live schema inventory](ZAVQERA_LIVE_SCHEMA_INVENTORY_2026-10-01.md): 7 public tables, RLS enabled on all 7 (not forced), 18 policies, 13 triggers, 9 public functions and 5 extensions. No row data was queried or exported.
- Authoritative mutation RPCs retain `SECURITY DEFINER`, pinned `search_path=pg_catalog, public`, authenticated EXECUTE, and no anon/PUBLIC EXECUTE. This is a permission/metadata check, not a new behavior test.
- Supabase Security Advisor reports **0 errors and 6 warnings**: five signed-in SECURITY DEFINER mutation-boundary warnings, plus leaked-password protection disabled. Performance Advisor reports one informational unused index.
- Netlify branch artifact `6abe25c07d794f000812021c` is `ready` at tested runtime commit `a89d0a1b1516fffc53c981c594202da602b33808`. This is the branch preview, not the primary production deployment.
- Netlify environment contexts were reviewed without intentionally retaining secret values. Production, branch-deploy and deploy-preview Supabase URL contexts point to Development. Do not accept real public user data under this configuration.
- Current documentation already contains backup/recovery, operations, domain, E2E owner-run, and final launch-gate plans. The owner decision sheet records the five selected strategies; this does not imply execution.
- Current local E2E remains **not executed**. It must run against the isolated disposable local stack only, never hosted Development.

## Owner-selected strategies (execution pending)

1. Dedicated Supabase Production, separate from Supabase Main.
2. Upgrade Netlify capacity, after reviewing the final billing screen.
3. Supabase Pro managed daily backups, followed by a restore drill.
4. Custom domain, after selecting the exact hostname and confirming its cost.
5. Run isolated local Docker/Supabase authenticated E2E.

## Work completed without payment

- Read-only Development project, migration-history, catalog, RLS/policy/grant, trigger/function, extension/index/column/constraint and advisor checks.
- Committed [live schema inventory](ZAVQERA_LIVE_SCHEMA_INVENTORY_2026-10-01.md) and linked it from this preparation record.
- Read-only Netlify branch deployment and environment-context review.
- Updated `docs/ZAVQERA_OWNER_LAUNCH_DECISIONS.md` to record the owner's selected directions.
- No application, database schema, migration history, DNS, billing, credentials, or production deployment was changed.

## Safe sequence before any production data migration

1. Review the live schema inventory and the current owner-approved production schema strategy. Historical repository migration replay is known to be incomplete; do not reconstruct old migrations or blindly replay repository history.
2. Prepare a reviewed, schema-only export plan for the new production project. Include application-owned tables, constraints, indexes, triggers, functions, RLS policies/grants and the required application auth hook; exclude Development user data and managed Supabase Auth schema/data.
3. Produce a reviewed SQL snapshot, compare its object inventory to the live catalog, and record its hash. Do not use the E2E snapshot as a production migration artifact without a separate review.
4. After the production project exists, verify its exact project ref, region, plan, Postgres major version, extensions and empty-state before applying the reviewed schema.
5. Reconcile production schema/history through an explicitly reviewed, repeatable process. Never modify Supabase Main.
6. Create and privately verify the new project's publishable configuration. Update Netlify contexts only after confirming the exact target ref and completing the production smoke plan. Never place service-role keys or database passwords in `NEXT_PUBLIC_*`.
7. Confirm backups are available, assign backup/restore and incident owners, and rehearse restore in an isolated target before public user intake.
8. Run the owner-run E2E locally, capture sanitized evidence, then recheck branch deployment, production URL, auth redirects, health route and rollback path.

## Still pending / not claimed

- No Production Supabase project created; the Free organization reached its two-active-project limit.
- No plan upgrade or payment performed.
- No Netlify production deploy/promotion, environment context change or DNS change performed.
- No database export, migration, backup, restore, or user-data copy performed.
- No authenticated browser E2E execution claimed. The current execution environment has no mounted repository checkout, Docker CLI or Supabase CLI, so this step must run on the owner's trusted test machine.
- Public production remains **NOT AUTHORIZED** until the above release gates are verified.

## Safety boundaries

Supabase Main, Git `main`, and protected PRs #12/#19/#20 remain untouched. Never commit connection strings, credentials, auth data, production dumps, local E2E artifacts or secret values.

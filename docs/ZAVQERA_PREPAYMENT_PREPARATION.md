# ZAVQERA pre-payment preparation

**Date:** 2026-10-01  
**Status:** Safe preparation completed; no payment or infrastructure mutation performed.

## Confirmed read-only evidence

- Authorized database inspected: **ZAVQERA Development**, project ref `mrwmmbytcymqgwvcoywd`, region `eu-west-1`, PostgreSQL 17.6.1.166, status `ACTIVE_HEALTHY`.
- Development migration registry contains W18 `20260929182538`, reconciled W20 `20261001081755`, and W21 `20261001091146`. No migration was applied during this preparation.
- Read-only live catalog inventory: 7 public tables, RLS enabled on all 7 (not forced), 18 policies, 13 application-table triggers, 9 public functions and 5 extensions. No row data was queried or exported.
- Static function review: five signed-in mutation RPCs are `SECURITY DEFINER`, use `search_path=pg_catalog, public`, check authentication/ownership and use row locks for versioned transitions. Function ACLs deny `PUBLIC` and `anon` execution; only intended RPCs grant `authenticated` execution. This is not a concurrency/E2E test.
- **Auth hook confirmed:** the real `auth.users` trigger calls `private.handle_new_user_profile()` with `search_path=pg_catalog`. A second `public.handle_new_user_profile()` exists but is not the trigger target and cannot be executed by `PUBLIC`, `anon` or `authenticated`. Do not substitute it in a schema snapshot; duplicate cleanup is deferred to a separately reviewed migration.
- Supabase Security Advisor reports **0 errors and 6 warnings**: five signed-in SECURITY DEFINER mutation-boundary warnings, plus leaked-password protection disabled. Performance Advisor reports one informational unused index.
- Netlify branch artifact `6abe25c07d794f000812021c` is `ready` at runtime commit `a89d0a1b1516fffc53c981c594202da602b33808`. This is the branch preview, not the primary production deployment.
- Netlify environment contexts were reviewed without retaining secret values. Production, branch-deploy and deploy-preview Supabase URL contexts point to Development. Do not accept real public user data under this configuration.
- Current local E2E remains **not executed**. It must run against the isolated disposable local stack only, never hosted Development.

## Owner-selected strategies (execution pending)

1. Dedicated Supabase Production, separate from Supabase Main.
2. Upgrade Netlify capacity, after reviewing the final billing screen.
3. Supabase Pro managed daily backups, followed by a restore drill.
4. Custom domain, after selecting the exact hostname and confirming its cost.
5. Run isolated local Docker/Supabase authenticated E2E.

## Work completed without payment

- Read-only Development project, migration-history, schema, RLS/policy/grant, trigger/function/ACL, extension/index/column/constraint, actual Auth trigger target and advisor checks.
- Committed [live schema inventory](ZAVQERA_LIVE_SCHEMA_INVENTORY_2026-10-01.md) and linked it from this preparation record.
- Read-only Netlify branch deployment and environment-context review.
- Updated the owner decision sheet and pre-payment preparation docs.
- No application, database schema, migration history, DNS, billing, credentials, or production deployment was changed.

## Safe sequence before any production schema migration

1. Review the live schema inventory and production schema strategy. Historical repository migration replay is incomplete; do not blindly replay repository migrations.
2. Prepare a reviewed schema-only export for the new production project. Include application tables, constraints, indexes, triggers, functions, RLS/policies/grants and the specifically verified `private.handle_new_user_profile()` plus its `auth.users` trigger binding. Exclude Development user data, custom roles and managed Supabase Auth schema/data.
3. Generate a reviewed SQL snapshot, compare object inventory with the live catalog, and record its hash. Do not use the E2E snapshot as a production artifact without separate review.
4. After Production exists, verify exact project ref, region, plan, PostgreSQL major version, extensions and empty state before applying the reviewed schema.
5. Reconcile production schema/history through a reviewed, repeatable process. Never modify Supabase Main.
6. Privately verify production publishable configuration. Update Netlify contexts only after exact target-ref verification and a production smoke plan. Never put service-role keys or database passwords in `NEXT_PUBLIC_*`.
7. Confirm backups are available and rehearse restore in an isolated target before public user intake.
8. Run owner E2E locally, capture sanitized evidence, then verify deployment, production URL, auth redirects, health route and rollback path.

## Still pending / not claimed

- No Production Supabase project created; the Free organization reached its two-active-project limit.
- No plan upgrade or payment performed.
- No Netlify production deploy/promotion, environment context change or DNS change performed.
- No database export, migration, backup, restore, or user-data copy performed.
- No authenticated browser E2E execution claimed. The current execution environment has no mounted repository checkout, Docker CLI or Supabase CLI; run on the owner's trusted test machine.
- Public production remains **NOT AUTHORIZED** until the release gates are verified.

## Safety boundaries

Supabase Main, Git `main`, and protected PRs #12/#19/#20 remain untouched. Never commit connection strings, credentials, auth data, production dumps, local E2E artifacts or secret values.

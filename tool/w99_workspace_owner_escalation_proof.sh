#!/usr/bin/env bash
# Runtime proof that a workspace admin cannot take ownership by writing to the
# table directly, and that the operation they are supposed to have still works.
#
# This is a runtime proof on purpose. A static check that reads the policy text
# would have passed throughout: the policies are not malformed, they simply do
# not mention owner_id, and RLS cannot compare a row's old and new values. The
# hole was only visible by connecting as `authenticated` and trying it.
#
# The database is built from this repository's own migrations, in order, so the
# proof is about the real chain and not about a reconstruction of it.
#
# Requires DATABASE_URL pointing at an empty PostgreSQL 17 database.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

OWNER=00000000-0000-0000-0000-00000000000a
ADMIN=00000000-0000-0000-0000-00000000000b
WORKSPACE=00000000-0000-0000-0000-000000000011

failures=0
note() { printf '  %s\n' "$1"; }
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }

# One migration uses the MAINTAIN privilege, which exists from PostgreSQL 17.
# Say so plainly rather than failing later with an unrecognised-privilege error.
server_major="$(psql "$DATABASE_URL" -t -A --quiet --no-psqlrc -c 'show server_version_num;' | cut -c1-2)"
if [ "${server_major}" -lt "${MIN_PG_MAJOR:-17}" ]; then
  printf 'This proof needs PostgreSQL %s or newer; the server reports major version %s.\n' "${MIN_PG_MAJOR:-17}" "$server_major" >&2
  exit 2
fi

printf '== building the schema from %s migrations ==\n' \
  "$(find "$REPO_ROOT/supabase/migrations" -name '*.sql' | wc -l | tr -d ' ')"

# The smallest Supabase-compatible shape the migrations reference. auth.uid()
# reads a setting so the proof can act as a specific person.
"${PSQL[@]}" <<'SQL'
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth;
create schema if not exists private;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique);
create or replace function auth.uid() returns uuid language sql stable as
$f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as
$f$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $f$;
-- Created by Supabase's own auth bootstrap, referenced by w28's hardening pass.
create or replace function public.handle_new_user_profile() returns trigger
language plpgsql security definer set search_path to 'public' as
$f$ begin return new; end $f$;
SQL

applied=0
while IFS= read -r migration; do
  # SKIP_MIGRATION_GLOB exists only so the proof can be exercised on an
  # older local server. CI leaves it unset and applies every migration.
  if [ -n "${SKIP_MIGRATION_GLOB:-}" ]; then
    case "$migration" in *"$SKIP_MIGRATION_GLOB"*) continue;; esac
  fi
  "${PSQL[@]}" -f "$migration" >/dev/null
  applied=$((applied + 1))
done < <(find "$REPO_ROOT/supabase/migrations" -name '*.sql' | sort)
note "applied $applied migrations"

printf '\n== seeding one workspace, one owner, one admin ==\n'
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email) values
  ('$OWNER','owner@proof.invalid'), ('$ADMIN','admin@proof.invalid')
on conflict (id) do nothing;
insert into public.workspaces (id, owner_id, name) values ('$WORKSPACE','$OWNER','Proof workspace')
on conflict (id) do nothing;
insert into public.workspace_members (workspace_id, user_id, role) values
  ('$WORKSPACE','$OWNER','owner'), ('$WORKSPACE','$ADMIN','admin')
on conflict do nothing;
SQL

as_admin() {
  psql "$DATABASE_URL" --quiet --no-psqlrc -t -A <<SQL 2>&1
set role authenticated;
select set_config('request.jwt.claim.sub','$ADMIN',false);
$1
SQL
}
scalar() { psql "$DATABASE_URL" --quiet --no-psqlrc -t -A -c "$1"; }

printf '\n== the attack must fail ==\n'
if as_admin "update public.workspaces set owner_id='$ADMIN' where id='$WORKSPACE';" | grep -q 'permission denied'; then
  pass "an admin cannot write owner_id on public.workspaces"
else
  fail "an admin was able to attempt a write to owner_id"
fi

owner_now="$(scalar "select owner_id from public.workspaces where id='$WORKSPACE';" | tr -d '[:space:]')"
if [ "$owner_now" = "$OWNER" ]; then
  pass "owner_id is unchanged after the attempt"
else
  fail "owner_id changed to $owner_now"
fi

printf '\n== the rightful owner must keep control ==\n'
# workspaces_delete_owner permits DELETE where owner_id = auth.uid(). This is
# what the takeover actually bought, so it is what the proof measures.
thief="$(scalar "select count(*) from public.workspaces where id='$WORKSPACE' and owner_id='$ADMIN';" | tr -d '[:space:]')"
rightful="$(scalar "select count(*) from public.workspaces where id='$WORKSPACE' and owner_id='$OWNER';" | tr -d '[:space:]')"
[ "$thief" = "0" ] && pass "the admin does not satisfy the owner-only delete policy" \
  || fail "the admin satisfies the owner-only delete policy"
[ "$rightful" = "1" ] && pass "the rightful owner still does" \
  || fail "the rightful owner lost the workspace"

printf '\n== self-promotion must stay closed ==\n'
if as_admin "update public.workspace_members set role='owner' where workspace_id='$WORKSPACE' and user_id='$ADMIN';" | grep -q 'permission denied'; then
  pass "an admin cannot write public.workspace_members directly"
else
  fail "an admin was able to attempt a direct membership write"
fi
role_now="$(scalar "select role from public.workspace_members where workspace_id='$WORKSPACE' and user_id='$ADMIN';" | tr -d '[:space:]')"
[ "$role_now" = "admin" ] && pass "the admin's role is unchanged" || fail "the admin's role became $role_now"

printf '\n== the supported operation must still work ==\n'
# Assert the effect, not psql's status line: under -t -A that line is
# suppressed, so grepping for it would report a failure that never happened.
rename_error="$(as_admin "update public.workspaces set name='Renamed by the admin' where id='$WORKSPACE';" | grep -i 'error' || true)"
renamed="$(scalar "select name from public.workspaces where id='$WORKSPACE';")"
if [ -z "$rename_error" ] && [ "$renamed" = "Renamed by the admin" ]; then
  pass "an admin can still rename the workspace"
else
  fail "renaming the workspace broke (name is now '$renamed') $rename_error"
fi

printf '\n== the privilege itself, not only its effect ==\n'
cols="$(scalar "select coalesce(string_agg(column_name, ',' order by column_name), '(none)')
  from information_schema.column_privileges
  where table_schema='public' and table_name='workspaces'
    and grantee='authenticated' and privilege_type='UPDATE';" | tr -d '[:space:]')"
[ "$cols" = "name" ] && pass "UPDATE is granted on name only (got: $cols)" \
  || fail "UPDATE is granted on: $cols — expected exactly 'name'"

table_level="$(scalar "select count(*) from information_schema.role_table_grants
  where table_schema='public' and table_name='workspaces'
    and grantee='authenticated' and privilege_type='UPDATE';" | tr -d '[:space:]')"
[ "$table_level" = "0" ] && pass "the table-level UPDATE grant is gone" \
  || fail "a table-level UPDATE grant is still present"

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'W99 workspace ownership proof: all checks passed\n'
else
  printf 'W99 workspace ownership proof: %d check(s) failed\n' "$failures"
  exit 1
fi

#!/usr/bin/env bash
# Runtime proof that the website's own visitor figures are readable by the
# people who run the site and by nobody else.
#
# The first version of get_site_metrics() let in anyone who was owner or
# admin of a workspace. Every account is the owner of its own workspace from
# the moment it is created, so that check let in every signed-in customer.
# Here A is such a customer and S is a site operator. The proof is that A is
# refused, S is answered, and A cannot make themselves an operator.
#
# The schema is built from this repository's own migrations, in order.
# Requires DATABASE_URL pointing at an empty PostgreSQL 17 database.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

USER_A=00000000-0000-0000-0000-0000000000a1
USER_S=00000000-0000-0000-0000-0000000000c3

failures=0
note() { printf '  %s\n' "$1"; }
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }

# One migration uses the MAINTAIN privilege, which exists from PostgreSQL 17.
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
  "${PSQL[@]}" -f "$migration" >/dev/null
  applied=$((applied + 1))
done < <(find "$REPO_ROOT/supabase/migrations" -name '*.sql' | sort)
note "applied $applied migrations"

"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email) values
  ('$USER_A','a@proof.invalid'), ('$USER_S','s@proof.invalid')
on conflict (id) do nothing;
SQL

# Run SQL as one signed-in person. Errors come back as text, not as a failed
# command, so a check can assert on the refusal itself.
as_user() {
  psql "$DATABASE_URL" --quiet --no-psqlrc -t -A <<SQL 2>&1
set role authenticated;
select set_config('request.jwt.claim.sub','$1',false);
$2
SQL
}
as_anon() {
  psql "$DATABASE_URL" --quiet --no-psqlrc -t -A <<SQL 2>&1
set role anon;
$1
SQL
}
# The last line of output: the answer, after the set_config echo.
answer() { tail -n 1 | tr -d '[:space:]'; }
# Counted as the table owner, past row level security: what is really there.
truth() { psql "$DATABASE_URL" --quiet --no-psqlrc -t -A -c "$1" | tr -d '[:space:]'; }

# A is an ordinary customer: owner of their own workspace, as every account is.
"${PSQL[@]}" >/dev/null <<SQL
with w as (
  insert into public.workspaces (owner_id, name) values ('$USER_A', 'A workspace') returning id
)
insert into public.workspace_members (workspace_id, user_id, role)
select id, '$USER_A', 'owner' from w
on conflict (workspace_id, user_id) do update set role = 'owner';
SQL
[ "$(truth "select count(*) from public.workspace_members where user_id='$USER_A' and role='owner';")" = "1" ] \
  || { printf 'setup failed: A is not the owner of a workspace\n' >&2; exit 2; }

printf '\n== a customer who owns a workspace is not a site operator ==\n'
if as_user "$USER_A" "select public.get_site_metrics();" | grep -q 'ANALYTICS_ADMIN_REQUIRED'; then
  pass "the owner of an ordinary workspace is refused the site's visitor figures"
else
  fail "the owner of an ordinary workspace can read the site's visitor figures"
fi
if as_user "$USER_S" "select public.get_site_metrics();" | grep -q 'ANALYTICS_ADMIN_REQUIRED'; then
  pass "an account nobody has named as operator is refused"
else
  fail "an account nobody has named as operator can read the site's visitor figures"
fi
if as_anon "select public.get_site_metrics();" | grep -q 'permission denied'; then
  pass "a visitor who is not signed in cannot call it at all"
else
  fail "anon can call get_site_metrics()"
fi

printf '\n== nobody can name themselves operator ==\n'
if as_user "$USER_A" "insert into private.site_admins (user_id) values ('$USER_A');" | grep -q 'permission denied'; then
  pass "a signed-in customer cannot add themselves to the operators"
else
  fail "a signed-in customer added themselves to the operators"
fi
if as_user "$USER_A" "select count(*) from private.site_admins;" | grep -q 'permission denied'; then
  pass "a signed-in customer cannot read who the operators are"
else
  fail "a signed-in customer can read the operator list"
fi
[ "$(truth "select count(*) from private.site_admins;")" = "0" ] \
  && pass "the operator list is still empty" || fail "a row reached the operator list"

printf '\n== the operator, once named by the database owner, is answered ==\n'
"${PSQL[@]}" -c "insert into private.site_admins (user_id) values ('$USER_S');" >/dev/null
answer_keys="$(as_user "$USER_S" "select string_agg(k, ',' order by k) from jsonb_object_keys(public.get_site_metrics()) k;" | answer)"
[ "$answer_keys" = "by_page,funnel,page_sources,sources" ] \
  && pass "the operator receives the four parts of the dashboard" \
  || fail "the operator did not receive the dashboard: $answer_keys"
if as_user "$USER_A" "select public.get_site_metrics();" | grep -q 'ANALYTICS_ADMIN_REQUIRED'; then
  pass "naming an operator does not let the customer in"
else
  fail "the customer can read the figures once any operator exists"
fi

printf '\n== the menu link asks only whether the caller is an operator ==\n'
[ "$(as_user "$USER_S" "select public.is_site_operator();" | answer)" = "t" ] \
  && pass "the operator is told they are one" || fail "the operator is not recognised"
[ "$(as_user "$USER_A" "select public.is_site_operator();" | answer)" = "f" ] \
  && pass "a customer is told they are not, without an error and without the list" \
  || fail "a customer is not answered 'false'"
if as_anon "select public.is_site_operator();" | grep -q 'permission denied'; then
  pass "a visitor who is not signed in cannot ask"
else
  fail "anon can call is_site_operator()"
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'Site metrics operator proof: all checks passed\n'
else
  printf 'Site metrics operator proof: %d check(s) failed\n' "$failures"
  exit 1
fi

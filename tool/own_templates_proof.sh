#!/usr/bin/env bash
# Runtime proof for own templates (public.user_templates).
#
# A is on Pro, B on Free; both act through the `authenticated` role exactly as
# the application does. The proof: only Pro and Scale can save or change a
# template; nobody reads, changes or removes anyone else's; the owner cannot
# be forged; the shape checks and the 100-template safeguard hold; after a
# downgrade the templates are kept, readable and removable, but frozen.
#
# A runtime proof on purpose: reading the policy text shows what was intended,
# not what the database does. The schema is built from this repository's own
# migrations, in order.
#
# Requires DATABASE_URL pointing at an empty PostgreSQL 17 database.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

USER_A=00000000-0000-0000-0000-0000000000a1
USER_B=00000000-0000-0000-0000-0000000000b2

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
  ('$USER_A','a@proof.invalid'), ('$USER_B','b@proof.invalid')
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

"${PSQL[@]}" >/dev/null <<SQL
insert into public.ai_entitlements (user_id, plan, monthly_limit) values
  ('$USER_A', 'pro', 30), ('$USER_B', 'free', 2)
on conflict (user_id) do update set plan = excluded.plan, monthly_limit = excluded.monthly_limit;
SQL

printf '\n== A, on Pro, saves a template ==\n'
# No owner_id is sent, as in the application: it comes from the session.
as_user "$USER_A" "insert into public.user_templates (name, intent, criteria, actions) values ('Open a café', 'Open on checked facts', array['Licence in writing'], array['List the licences','Compare three premises']);" >/dev/null
[ "$(truth "select count(*) from public.user_templates where owner_id='$USER_A' and name='Open a café';")" = "1" ] \
  && pass "the template is stored under A, taken from the session" || fail "A's template was not stored under A"
[ "$(as_user "$USER_A" "select private.has_own_templates();" | answer)" = "t" ] \
  && pass "the plan check says yes for A on Pro" || fail "the plan check refused A on Pro"
TEMPLATE_ID="$(truth "select id from public.user_templates where owner_id='$USER_A' limit 1;")"

printf '\n== B, on Free, can neither save nor reach A'"'"'s template ==\n'
if as_user "$USER_B" "insert into public.user_templates (name, actions) values ('B tries', array['x']);" | grep -q 'row-level security'; then
  pass "Free cannot save a template"
else
  fail "a Free account saved a template"
fi
[ "$(as_user "$USER_B" "select count(*) from public.user_templates;" | answer)" = "0" ] \
  && pass "B reads none of A's templates" || fail "B can read A's templates"
as_user "$USER_B" "update public.user_templates set name='Hijacked' where id='$TEMPLATE_ID';" >/dev/null
as_user "$USER_B" "delete from public.user_templates where id='$TEMPLATE_ID';" >/dev/null
[ "$(truth "select name from public.user_templates where id='$TEMPLATE_ID';")" = "Openacafé" ] \
  && pass "B can neither rename nor delete A's template" || fail "B changed or removed A's template"
[ "$(as_user "$USER_B" "select private.has_own_templates();" | answer)" = "f" ] \
  && pass "the plan check says no for B on Free" || fail "the plan check let B through"

printf '\n== the owner cannot be forged, and the shape holds ==\n'
if as_user "$USER_A" "insert into public.user_templates (owner_id, name, actions) values ('$USER_B', 'Forged', array['x']);" | grep -q 'permission denied'; then
  pass "owner_id cannot be written by a client"
else
  fail "a client wrote owner_id"
fi
if as_user "$USER_A" "update public.user_templates set owner_id='$USER_B' where id='$TEMPLATE_ID';" | grep -q 'permission denied'; then
  pass "owner_id cannot be changed by a client"
else
  fail "a client changed owner_id"
fi
for bad in "('No steps', '{}')" "(' padded ', array['x'])" "('Blank step', array['   '])"; do
  if as_user "$USER_A" "insert into public.user_templates (name, actions) values $bad;" | grep -q 'check constraint'; then
    pass "refused: $bad"
  else
    fail "stored a malformed template: $bad"
  fi
done

printf '\n== after a downgrade: kept, readable, removable, frozen ==\n'
"${PSQL[@]}" -c "update public.ai_entitlements set plan='free', monthly_limit=2 where user_id='$USER_A';" >/dev/null
[ "$(as_user "$USER_A" "select count(*) from public.user_templates;" | answer)" = "1" ] \
  && pass "A still reads the template on Free" || fail "a downgrade hid A's template"
if as_user "$USER_A" "update public.user_templates set name='Renamed' where id='$TEMPLATE_ID';" | grep -q 'row-level security'; then
  pass "on Free the template cannot be changed"
else
  fail "a Free account changed a template"
fi
as_user "$USER_A" "delete from public.user_templates where id='$TEMPLATE_ID';" >/dev/null
[ "$(truth "select count(*) from public.user_templates where owner_id='$USER_A';")" = "0" ] \
  && pass "on Free the owner can still delete it" || fail "a downgraded owner could not delete their template"

printf '\n== the storage safeguard: 100 per person ==\n'
"${PSQL[@]}" -c "update public.ai_entitlements set plan='scale', monthly_limit=90 where user_id='$USER_A';" >/dev/null
as_user "$USER_A" "insert into public.user_templates (name, actions) select 'T' || i, array['s'] from generate_series(1, 100) as i;" >/dev/null
[ "$(truth "select count(*) from public.user_templates where owner_id='$USER_A';")" = "100" ] \
  && pass "Scale saves 100 templates" || fail "Scale could not save 100 templates"
if as_user "$USER_A" "insert into public.user_templates (name, actions) values ('T101', array['s']);" | grep -q 'TEMPLATE_LIMIT_REACHED'; then
  pass "the 101st is refused"
else
  fail "a 101st template was stored"
fi

printf '\n== a visitor gets nothing ==\n'
if as_anon "select count(*) from public.user_templates;" | grep -q 'permission denied'; then
  pass "a visitor cannot read templates"
else
  fail "anon can query public.user_templates"
fi
if as_anon "select private.has_own_templates();" | grep -q 'permission denied'; then
  pass "a visitor cannot call the plan check"
else
  fail "anon can call private.has_own_templates()"
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'Own templates proof: all checks passed\n'
else
  printf 'Own templates proof: %d check(s) failed\n' "$failures"
  exit 1
fi

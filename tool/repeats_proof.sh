#!/usr/bin/env bash
# Runtime proof for repeating checklists (public.mission_repeats).
#
# A owns a workspace on Free; B is an outsider, then a viewer, then an editor.
# Both act through the `authenticated` role. The proof: only an editor sets up
# a repeat; Free runs one; nobody writes the tables directly; a run is made
# once per period, with the steps and their owners; a viewer never makes one;
# outsiders see nothing; stopping keeps the runs already made.

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
WS=00000000-0000-0000-0000-00000000aaaa
M1=00000000-0000-0000-0000-000000000c01
M2=00000000-0000-0000-0000-000000000c02
"${PSQL[@]}" >/dev/null <<SQL
select set_config('request.jwt.claim.sub','$USER_A',false);
insert into public.ai_entitlements (user_id, plan, monthly_limit) values
  ('$USER_A', 'free', 2), ('$USER_B', 'free', 2)
on conflict (user_id) do update set plan = excluded.plan, monthly_limit = excluded.monthly_limit;
insert into public.workspaces (id, owner_id, name) values ('$WS', '$USER_A', 'A');
insert into public.workspace_members (workspace_id, user_id, role) values ('$WS', '$USER_A', 'owner') on conflict do nothing;
insert into public.missions (id, workspace_id, owner_id, objective, status) values
  ('$M1', '$WS', '$USER_A', E'Close the café\n\nEvery evening.', 'DRAFT'),
  ('$M2', '$WS', '$USER_A', 'Weekly kitchen clean', 'DRAFT');
insert into public.mission_actions (mission_id, title, status, position) values
  ('$M1', 'Count the till', 'PENDING', 0), ('$M1', 'Dropped', 'CANCELLED', 1), ('$M1', 'Lock the doors', 'PENDING', 2),
  ('$M2', 'Clean the fridge', 'PENDING', 0);
update public.mission_actions set assignee_id = '$USER_A' where mission_id = '$M1' and position = 0;
SQL

printf '\n== an outsider can neither set up nor see a repeat ==\n'
if as_user "$USER_B" "select public.create_mission_repeat('$M1','daily',null,null,null,'Europe/Oslo');" | grep -q 'MISSION_NOT_FOUND_OR_FORBIDDEN'; then
  pass "an outsider is refused"; else fail "an outsider set up a repeat"; fi

printf '\n== A sets up a daily repeat; the checklist is the first run ==\n'
REPEAT="$(as_user "$USER_A" "select public.create_mission_repeat('$M1','daily',null,null,null,'Europe/Oslo');" | answer)"
[ "$(truth "select count(*) from public.mission_repeat_runs where repeat_id='$REPEAT' and mission_id='$M1';")" = "1" ] \
  && pass "the checklist it was set up on is today's run" || fail "the first run was not recorded"
[ "$(truth "select jsonb_array_length(steps) from public.mission_repeats where id='$REPEAT';")" = "2" ] \
  && pass "cancelled steps are not repeated" || fail "the steps were copied wrong"
if as_user "$USER_A" "select public.create_mission_repeat('$M2','weekly',null,1::smallint,null,'Europe/Oslo');" | grep -q 'REPEAT_LIMIT_REACHED'; then
  pass "Free runs one repeat"; else fail "Free set up a second repeat"; fi
if as_user "$USER_A" "insert into public.mission_repeats (workspace_id, created_by, objective, steps, frequency, time_zone) values ('$WS','$USER_A','x','[{\"title\":\"x\"}]','daily','UTC');" | grep -q 'permission denied'; then
  pass "nobody writes the table directly"; else fail "a client wrote mission_repeats"; fi
if as_user "$USER_A" "update public.mission_repeats set active=false;" | grep -q 'permission denied'; then
  pass "nobody changes a repeat directly"; else fail "a client changed mission_repeats"; fi

printf '\n== the next period makes one run, with the steps and owners ==\n'
"${PSQL[@]}" >/dev/null -c "delete from public.mission_repeat_runs where repeat_id='$REPEAT';"
MADE="$(as_user "$USER_A" "select public.run_due_mission_repeats();" | answer)"
AGAIN="$(as_user "$USER_A" "select public.run_due_mission_repeats();" | answer)"
[ "$MADE/$AGAIN" = "1/0" ] && pass "one run per period, however often the app is opened" || fail "runs made: $MADE then $AGAIN"
RUN="$(truth "select mission_id from public.mission_repeat_runs where repeat_id='$REPEAT';")"
[ "$(truth "select count(*) from public.mission_actions where mission_id='$RUN';")" = "2" ] \
  && pass "the run has the repeated steps" || fail "the run has the wrong steps"
[ "$(truth "select assignee_id from public.mission_actions where mission_id='$RUN' and position=0;")" = "$USER_A" ] \
  && pass "the step owner comes back" || fail "the step owner was lost"
[ "$(truth "select count(*) from public.action_due_dates where mission_id='$RUN';")" = "2" ] \
  && pass "every step is due at the end of its period" || fail "the steps have no due date"
truth "select split_part(objective, E'\n', 1) from public.missions where id='$RUN';" | grep -q '^Closethecafé·[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}$' \
  && pass "the run is named with its date" || fail "the run is not named with its date"

printf '\n== a viewer reads but never makes runs; an outsider reads nothing ==\n'
[ "$(as_user "$USER_B" "select count(*) from public.mission_repeats;" | answer)" = "0" ] \
  && pass "an outsider reads no repeats" || fail "an outsider reads repeats"
"${PSQL[@]}" >/dev/null -c "insert into public.workspace_members (workspace_id, user_id, role) values ('$WS', '$USER_B', 'viewer');"
"${PSQL[@]}" >/dev/null -c "delete from public.mission_repeat_runs where repeat_id='$REPEAT';"
[ "$(as_user "$USER_B" "select count(*) from public.mission_repeats;" | answer)" = "1" ] \
  && pass "a viewer reads the repeat" || fail "a viewer cannot read the repeat"
[ "$(as_user "$USER_B" "select public.run_due_mission_repeats();" | answer)" = "0" ] \
  && pass "a viewer opening the app makes no run" || fail "a viewer made a run"
if as_user "$USER_B" "select public.stop_mission_repeat('$REPEAT');" | grep -q 'REPEAT_NOT_FOUND_OR_FORBIDDEN'; then
  pass "a viewer cannot stop it"; else fail "a viewer stopped the repeat"; fi

printf '\n== stopping keeps the runs already made ==\n'
as_user "$USER_A" "select public.stop_mission_repeat('$REPEAT');" >/dev/null
[ "$(truth "select active from public.mission_repeats where id='$REPEAT';")/$(truth "select count(*) from public.missions where id='$RUN';")" = "f/1" ] \
  && pass "stopped, and the earlier run is still there" || fail "stopping lost a run or did not stop"
[ "$(as_user "$USER_A" "select public.run_due_mission_repeats();" | answer)" = "0" ] \
  && pass "a stopped repeat makes nothing" || fail "a stopped repeat made a run"

printf '\n== the period rules ==\n'
[ "$(truth "select private.repeat_period('weekly','{1}',1::smallint,null,'2026-11-26');")" = "2026-11-23" ] \
  && pass "a weekly run belongs to its Monday" || fail "weekly period wrong"
[ "$(truth "select private.repeat_period('monthly','{1}',null,31::smallint,'2026-11-26');")/$(truth "select private.repeat_period_end('monthly','{1}',null,31::smallint,'2026-10-31');")" = "2026-10-31/2026-11-29" ] \
  && pass "the last day of a month runs to the day before the next" || fail "monthly period wrong"
[ "$(truth "select private.repeat_period('daily','{1,2,3,4,5}',null,null,'2026-11-29');")" = "2026-11-27" ] \
  && pass "a weekday list skips the weekend" || fail "daily period wrong"

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'Repeating checklists proof: all checks passed\n'
else
  printf 'Repeating checklists proof: %d check(s) failed\n' "$failures"
  exit 1
fi

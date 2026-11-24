#!/usr/bin/env bash
# Runtime proof for plan dates and the calendar link.
#
# A owns a workspace and its Missions; B is outside it, then a member. Both
# act through the `authenticated` role, and the calendar is read as `anon`
# with the link's token, exactly as Google, Apple and Outlook fetch it. The
# proof: only the owner dates a Mission; members read; outsiders get nothing;
# a step's date stays inside its Mission; the link is unguessable, closed to
# direct reads and replaceable; the feed leaves cancelled steps out; and the
# plan decides how many Missions the link carries (1, 3, all), pausing the
# extra ones on a downgrade without deleting them.

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
select set_config('request.jwt.claim.sub','$USER_A',false);
insert into public.ai_entitlements (user_id, plan, monthly_limit) values
  ('$USER_A', 'free', 2), ('$USER_B', 'free', 2)
on conflict (user_id) do update set plan = excluded.plan, monthly_limit = excluded.monthly_limit;
insert into public.workspaces (id, owner_id, name) values ('00000000-0000-0000-0000-00000000aaaa', '$USER_A', 'A');
insert into public.workspace_members (workspace_id, user_id, role) values ('00000000-0000-0000-0000-00000000aaaa', '$USER_A', 'owner') on conflict do nothing;
insert into public.missions (id, workspace_id, owner_id, objective, status) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-00000000aaaa', '$USER_A', 'Move to Germany', 'DRAFT')
on conflict do nothing;
SQL

WS=00000000-0000-0000-0000-00000000aaaa
M1=00000000-0000-0000-0000-000000000c01
M2=00000000-0000-0000-0000-000000000c02
M3=00000000-0000-0000-0000-000000000c03
S1=00000000-0000-0000-0000-000000000d01
S2=00000000-0000-0000-0000-000000000d02
S3=00000000-0000-0000-0000-000000000d03
"${PSQL[@]}" >/dev/null <<SQL
select set_config('request.jwt.claim.sub','$USER_A',false);
insert into public.missions (id, workspace_id, owner_id, objective, status) values
  ('$M2', '$WS', '$USER_A', 'Open a café', 'DRAFT'), ('$M3', '$WS', '$USER_A', 'Find a job', 'DRAFT');
insert into public.mission_actions (id, mission_id, title, status, position) values
  ('$S1', '$M1', 'Book the Anmeldung', 'PENDING', 0),
  ('$S2', '$M1', 'Dropped step', 'CANCELLED', 1),
  ('$S3', '$M2', 'List the licences', 'PENDING', 0);
SQL

printf '\n== the owner dates the plan ==\n'
as_user "$USER_A" "insert into public.mission_schedules (mission_id, target_date) values ('$M1', '2027-03-01');
insert into public.action_due_dates (action_id, mission_id, due_on, basis) values ('$S1', '$M1', '2027-03-15', 'law'), ('$S2', '$M1', '2027-03-20', null);" >/dev/null
[ "$(truth "select count(*) from public.action_due_dates where mission_id='$M1';")" = "2" ] \
  && pass "the owner sets the target date and step dates" || fail "the owner could not date the plan"
as_user "$USER_A" "update public.mission_schedules set target_date='2027-03-02' where mission_id='$M1';
update public.action_due_dates set due_on='2027-03-16', basis=null where action_id='$S1' and mission_id='$M1';" >/dev/null
[ "$(truth "select s.target_date || '/' || d.due_on || '/' || coalesce(d.basis, 'none') from public.mission_schedules s join public.action_due_dates d on d.mission_id = s.mission_id where s.mission_id='$M1' and d.action_id='$S1';")" = "2027-03-02/2027-03-16/none" ] \
  && pass "the owner changes dates already set, as the app does (update, then insert)" || fail "the owner could not change an existing date"
"${PSQL[@]}" -c "update public.mission_schedules set target_date='2027-03-01' where mission_id='$M1'; update public.action_due_dates set due_on='2027-03-15', basis='law' where action_id='$S1';" >/dev/null
# PostgREST's upsert rewrites the key column too, which the column grants refuse:
# the app must never use it here (found live, 24 Nov).
if as_user "$USER_A" "insert into public.mission_schedules (mission_id, target_date) values ('$M1', '2027-05-05') on conflict (mission_id) do update set mission_id = excluded.mission_id, target_date = excluded.target_date;" | grep -q 'permission denied'; then
  pass "an upsert that rewrites the key is refused, so the app does not use one"
else
  fail "an upsert rewriting mission_id was accepted"
fi
if as_user "$USER_A" "insert into public.action_due_dates (action_id, mission_id, due_on) values ('$S3', '$M1', '2027-03-02');" | grep -q 'row-level security'; then
  pass "a step cannot be dated under another Mission"
else
  fail "a step was dated under a Mission it does not belong to"
fi
if as_user "$USER_A" "update public.action_due_dates set mission_id='$M2' where action_id='$S1';" | grep -q 'permission denied'; then
  pass "a step date cannot be moved to another Mission"
else
  fail "a step date's Mission could be changed"
fi

printf '\n== outsiders and members ==\n'
[ "$(as_user "$USER_B" "select count(*) from public.mission_schedules;" | answer)" = "0" ] \
  && pass "an outsider reads no dates" || fail "an outsider read A's dates"
if as_user "$USER_B" "insert into public.mission_schedules (mission_id, target_date) values ('$M2', '2027-01-01');" | grep -q 'row-level security'; then
  pass "an outsider cannot date A's Mission"
else
  fail "an outsider dated A's Mission"
fi
if as_user "$USER_B" "insert into public.calendar_missions (mission_id) values ('$M1');" | grep -q 'row-level security'; then
  pass "an outsider cannot put A's Mission in a calendar"
else
  fail "an outsider put A's Mission in their calendar"
fi
"${PSQL[@]}" >/dev/null <<SQL
select set_config('request.jwt.claim.sub','$USER_A',false);
insert into public.workspace_members (workspace_id, user_id, role) values ('$WS', '$USER_B', 'member');
SQL
[ "$(as_user "$USER_B" "select count(*) from public.mission_schedules;" | answer)" = "1" ] \
  && pass "a workspace member reads the dates" || fail "a member could not read the dates"
as_user "$USER_B" "update public.mission_schedules set target_date='2030-01-01' where mission_id='$M1'; delete from public.action_due_dates where action_id='$S1';" >/dev/null
[ "$(truth "select target_date || '/' || (select count(*) from public.action_due_dates where action_id='$S1') from public.mission_schedules where mission_id='$M1';")" = "2027-03-01/1" ] \
  && pass "a member cannot change or remove the owner's dates" || fail "a member changed the owner's dates"

printf '\n== the calendar link ==\n'
TOKEN="$(as_user "$USER_A" "select public.calendar_feed_token();" | answer)"
[[ "$TOKEN" =~ ^[0-9a-f]{64}$ ]] && pass "the link token is 64 random hex characters" || fail "malformed token: $TOKEN"
[ "$(as_user "$USER_A" "select public.calendar_feed_token();" | answer)" = "$TOKEN" ] \
  && pass "the same link comes back until it is replaced" || fail "the link changed on its own"
if as_user "$USER_A" "select count(*) from public.calendar_feeds;" | grep -q 'permission denied'; then
  pass "nobody reads the link table directly"
else
  fail "public.calendar_feeds is readable"
fi
if as_anon "select public.calendar_feed_token();" | grep -q 'permission denied'; then
  pass "a visitor cannot make a link"
else
  fail "anon created a calendar link"
fi
as_user "$USER_A" "insert into public.calendar_missions (mission_id) values ('$M1');" >/dev/null
if as_user "$USER_A" "insert into public.calendar_missions (mission_id) values ('$M2');" | grep -q 'CALENDAR_LIMIT_REACHED'; then
  pass "Free carries one Mission"
else
  fail "Free added a second Mission to the calendar"
fi
[ "$(as_anon "select count(*) from public.calendar_feed_events('$TOKEN');" | answer)" = "2" ] \
  && pass "the feed has the target date and the live step, not the cancelled one" || fail "the feed rows are wrong"
[ "$(as_anon "select count(*) from public.calendar_feed_events('$TOKEN') where basis = 'law';" | answer)" = "1" ] \
  && pass "a legal deadline keeps its basis" || fail "the legal basis was lost"
[ "$(as_anon "select count(*) from public.calendar_feed_events(repeat('0', 64));" | answer)" = "0" ] \
  && pass "an unknown link returns nothing" || fail "an unknown link returned rows"
[ "$(as_anon "select count(*) from public.calendar_feed_events('x'' or 1=1 --');" | answer)" = "0" ] \
  && pass "a malformed link returns nothing" || fail "a malformed link returned rows"
if as_anon "select count(*) from public.mission_schedules;" | grep -q 'permission denied'; then
  pass "a visitor cannot read dates directly"
else
  fail "anon can read public.mission_schedules"
fi

printf '\n== connection status: recorded by the feed, read only by the owner ==\n'
[ "$(as_user "$USER_A" "select coalesce(last_client, 'none') from public.calendar_feed_status();" | answer)" = "none" ] \
  && pass "no status before any calendar has fetched the link" || fail "a status existed before any fetch"
as_anon "select public.calendar_feed_touch('$TOKEN', 'apple'); select public.calendar_feed_touch(repeat('0', 64), 'google'); select public.calendar_feed_touch('x'' or 1=1 --', 'google');" >/dev/null
[ "$(as_user "$USER_A" "select last_client || '/' || (last_fetched_at is not null) from public.calendar_feed_status();" | answer)" = "apple/true" ] \
  && pass "a fetch by Apple Calendar is recorded on the owner's link" || fail "the fetch was not recorded"
[ "$(truth "select count(*) from public.calendar_feeds where last_client is not null;")" = "1" ] \
  && pass "an unknown or malformed link records nothing" || fail "a bad token touched a link"
[ "$(as_user "$USER_B" "select count(*) from public.calendar_feed_status();" | answer)" = "0" ] \
  && pass "nobody else sees the owner's status" || fail "another person read the status"
if as_anon "select * from public.calendar_feed_status();" | grep -q 'permission denied'; then
  pass "a visitor cannot read any status"
else
  fail "anon read a connection status"
fi

printf '\n== the plan decides how many Missions, and a downgrade pauses the rest ==\n'
"${PSQL[@]}" -c "update public.ai_entitlements set plan='scale', monthly_limit=90 where user_id='$USER_A';" >/dev/null
as_user "$USER_A" "insert into public.mission_schedules (mission_id, target_date) values ('$M2', '2027-05-01'), ('$M3', '2027-06-01');
insert into public.calendar_missions (mission_id) values ('$M2');
insert into public.calendar_missions (mission_id) values ('$M3');" >/dev/null
[ "$(as_anon "select count(distinct mission_id) from public.calendar_feed_events('$TOKEN');" | answer)" = "3" ] \
  && pass "Scale carries every Mission" || fail "Scale did not carry every Mission"
"${PSQL[@]}" -c "update public.ai_entitlements set plan='free', monthly_limit=2 where user_id='$USER_A';" >/dev/null
[ "$(as_anon "select string_agg(distinct objective, ',') from public.calendar_feed_events('$TOKEN');" | answer)" = "MovetoGermany" ] \
  && pass "after a downgrade to Free only the first Mission added stays" || fail "the downgrade kept the wrong Missions"
[ "$(truth "select count(*) from public.calendar_missions where owner_id='$USER_A';")" = "3" ] \
  && pass "the other choices are kept, paused, not deleted" || fail "a downgrade deleted calendar choices"
"${PSQL[@]}" -c "update public.ai_entitlements set plan='plus', monthly_limit=10 where user_id='$USER_A';" >/dev/null
[ "$(as_anon "select count(distinct mission_id) from public.calendar_feed_events('$TOKEN');" | answer)" = "3" ] \
  && pass "Plus carries three" || fail "Plus did not carry three Missions"

printf '\n== replacing the link ==\n'
NEW_TOKEN="$(as_user "$USER_A" "select public.calendar_feed_token(true);" | answer)"
[ "$NEW_TOKEN" != "$TOKEN" ] && [[ "$NEW_TOKEN" =~ ^[0-9a-f]{64}$ ]] && pass "a new link is issued" || fail "the link was not replaced"
[ "$(as_anon "select count(*) from public.calendar_feed_events('$TOKEN');" | answer)" = "0" ] \
  && pass "the old link stops working at once" || fail "the old link still returns rows"

printf '\n== deleting a Mission takes its dates and calendar place with it ==\n'
"${PSQL[@]}" >/dev/null <<SQL
delete from public.missions where id = '$M3';
SQL
[ "$(truth "select count(*) from public.mission_schedules where mission_id='$M3';")/$(truth "select count(*) from public.calendar_missions where mission_id='$M3';")" = "0/0" ] \
  && pass "nothing is left behind" || fail "dates or calendar rows outlived their Mission"

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'Plan dates and calendar proof: all checks passed\n'
else
  printf 'Plan dates and calendar proof: %d check(s) failed\n' "$failures"
  exit 1
fi

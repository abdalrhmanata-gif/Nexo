#!/usr/bin/env bash
# Runtime proof that opportunities stored in the account are private to the
# account that recorded them.
#
# Two people, A and B, each act through the `authenticated` role exactly as
# the application does. The proof is that B cannot read, add to, change or
# remove anything of A's — and that the things the page itself does (record,
# attach evidence, upload the same browser data twice, remove) still work.
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

OPPORTUNITY_COLUMNS="id, title, thesis, strategic_fit, potential_value, urgency, evidence_strength, effort, created_at_ms"
OPPORTUNITY_VALUES="'opp-1', 'A''s opportunity', 'A thesis', 3, 3, 3, 2, 3, 1"
EVIDENCE_COLUMNS="opportunity_id, id, url, title, observation, stance, source_type, reliability, checked_at, added_at_ms"
EVIDENCE_VALUES="'opp-1', 'ev-1', 'https://example.com/a', 'A source', 'What it says', 'supports', 'official', 3, '2026-11-13T00:00:00.000Z', 1"

printf '\n== A records an opportunity and one evidence note ==\n'
# No user_id is sent, as in the application: ownership comes from the session.
as_user "$USER_A" "insert into public.opportunities ($OPPORTUNITY_COLUMNS) values ($OPPORTUNITY_VALUES);" >/dev/null
as_user "$USER_A" "insert into public.opportunity_evidence_items ($EVIDENCE_COLUMNS) values ($EVIDENCE_VALUES);" >/dev/null
[ "$(truth "select count(*) from public.opportunities where user_id='$USER_A' and id='opp-1';")" = "1" ] \
  && pass "the opportunity is stored under A, taken from the session" \
  || fail "A's opportunity was not stored under A"
[ "$(as_user "$USER_A" "select count(*) from public.opportunity_evidence_items;" | answer)" = "1" ] \
  && pass "A reads back their own evidence note" \
  || fail "A cannot read their own evidence note"

printf '\n== B must not see anything of A'"'"'s ==\n'
[ "$(as_user "$USER_B" "select count(*) from public.opportunities;" | answer)" = "0" ] \
  && pass "B reads no opportunities" || fail "B can read A's opportunities"
[ "$(as_user "$USER_B" "select count(*) from public.opportunity_evidence_items;" | answer)" = "0" ] \
  && pass "B reads no evidence notes" || fail "B can read A's evidence notes"
[ "$(as_user "$USER_B" "select count(*) from public.opportunities where user_id='$USER_A';" | answer)" = "0" ] \
  && pass "asking for A's rows by A's id still returns nothing" || fail "B can read A's rows by naming A"

printf '\n== B must not write into A'"'"'s account ==\n'
if as_user "$USER_B" "insert into public.opportunities (user_id, $OPPORTUNITY_COLUMNS) values ('$USER_A', 'opp-forged', 'Forged', 'x', 3, 3, 3, 2, 3, 1);" | grep -q 'row-level security'; then
  pass "B cannot insert an opportunity in A's name"
else
  fail "B was able to insert an opportunity in A's name"
fi
if as_user "$USER_B" "insert into public.opportunity_evidence_items (user_id, $EVIDENCE_COLUMNS) values ('$USER_A', 'opp-1', 'ev-forged', 'https://example.com/b', 'Forged', 'x', 'supports', 'official', 3, '2026-11-13T00:00:00.000Z', 1);" | grep -q 'row-level security'; then
  pass "B cannot attach evidence in A's name"
else
  fail "B was able to attach evidence in A's name"
fi
if as_user "$USER_B" "insert into public.opportunity_evidence_items ($EVIDENCE_COLUMNS) values ('opp-1', 'ev-forged', 'https://example.com/b', 'Forged', 'x', 'supports', 'official', 3, '2026-11-13T00:00:00.000Z', 1);" | grep -q 'foreign key'; then
  pass "B cannot attach their own evidence to A's opportunity"
else
  fail "B attached evidence to an opportunity that is not theirs"
fi
as_user "$USER_B" "delete from public.opportunities where id='opp-1';" >/dev/null
as_user "$USER_B" "delete from public.opportunity_evidence_items where id='ev-1';" >/dev/null
[ "$(truth "select count(*) from public.opportunities where user_id='$USER_A';")" = "1" ] \
  && [ "$(truth "select count(*) from public.opportunity_evidence_items where user_id='$USER_A';")" = "1" ] \
  && pass "B's delete removes nothing of A's" || fail "B deleted A's data"
[ "$(truth "select count(*) from public.opportunity_evidence_items where id='ev-forged';")" = "0" ] \
  && [ "$(truth "select count(*) from public.opportunities where id='opp-forged';")" = "0" ] \
  && pass "nothing forged was stored" || fail "a forged row was stored"

printf '\n== nobody edits in place, and a visitor gets nothing ==\n'
if as_user "$USER_A" "update public.opportunities set title='Edited' where id='opp-1';" | grep -q 'permission denied'; then
  pass "there is no UPDATE, even for the owner"
else
  fail "UPDATE is possible on public.opportunities"
fi
if as_anon "select count(*) from public.opportunities;" | grep -q 'permission denied'; then
  pass "a visitor who is not signed in cannot read opportunities"
else
  fail "anon can query public.opportunities"
fi
if as_anon "select count(*) from public.opportunity_evidence_items;" | grep -q 'permission denied'; then
  pass "a visitor who is not signed in cannot read evidence notes"
else
  fail "anon can query public.opportunity_evidence_items"
fi

printf '\n== what the page does must keep working ==\n'
# The one-time upload from the browser may run twice (two tabs, a retry). The
# second run must add nothing and must not fail.
retry_error="$(as_user "$USER_A" "insert into public.opportunities ($OPPORTUNITY_COLUMNS) values ($OPPORTUNITY_VALUES) on conflict do nothing;
insert into public.opportunity_evidence_items ($EVIDENCE_COLUMNS) values ($EVIDENCE_VALUES) on conflict do nothing;" | grep -i 'error' || true)"
[ -z "$retry_error" ] \
  && [ "$(truth "select count(*) from public.opportunities where user_id='$USER_A';")" = "1" ] \
  && [ "$(truth "select count(*) from public.opportunity_evidence_items where user_id='$USER_A';")" = "1" ] \
  && pass "uploading the same browser data twice adds nothing and does not fail" \
  || fail "a repeated upload failed or duplicated rows $retry_error"

# B imports A's backup file: the same ids, in a different account.
import_error="$(as_user "$USER_B" "insert into public.opportunities ($OPPORTUNITY_COLUMNS) values ($OPPORTUNITY_VALUES);
insert into public.opportunity_evidence_items ($EVIDENCE_COLUMNS) values ($EVIDENCE_VALUES);" | grep -i 'error' || true)"
[ -z "$import_error" ] \
  && [ "$(as_user "$USER_B" "select count(*) from public.opportunities;" | answer)" = "1" ] \
  && pass "two accounts can hold the same opportunity id without colliding" \
  || fail "the same id in a second account collided $import_error"

if as_user "$USER_A" "insert into public.opportunities ($OPPORTUNITY_COLUMNS) values ('opp-bad', 'Bad rating', 'x', 9, 3, 3, 2, 3, 1);" | grep -q 'check constraint'; then
  pass "a rating outside 1–5 is refused"
else
  fail "a rating outside 1–5 was stored"
fi
if as_user "$USER_A" "insert into public.opportunities ($OPPORTUNITY_COLUMNS, evidence_url) values ('opp-bad', 'Bad link', 'x', 3, 3, 3, 2, 3, 1, 'javascript:alert(1)');" | grep -q 'check constraint'; then
  pass "a source link that is not http(s) is refused"
else
  fail "a non-http source link was stored"
fi

as_user "$USER_A" "delete from public.opportunities where id='opp-1';" >/dev/null
[ "$(truth "select count(*) from public.opportunities where user_id='$USER_A';")" = "0" ] \
  && [ "$(truth "select count(*) from public.opportunity_evidence_items where user_id='$USER_A';")" = "0" ] \
  && pass "A removes their opportunity and its evidence goes with it" \
  || fail "A's removal left rows behind"
[ "$(truth "select count(*) from public.opportunities where user_id='$USER_B';")" = "1" ] \
  && [ "$(truth "select count(*) from public.opportunity_evidence_items where user_id='$USER_B';")" = "1" ] \
  && pass "B's copy with the same ids is untouched by A's removal" \
  || fail "A's removal reached into B's account"

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'Opportunity isolation proof: all checks passed\n'
else
  printf 'Opportunity isolation proof: %d check(s) failed\n' "$failures"
  exit 1
fi

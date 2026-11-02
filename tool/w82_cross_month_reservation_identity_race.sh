#!/usr/bin/env bash
set -euo pipefail

: "${ZAVQERA_E2E_SUPABASE_WORKDIR:?The disposable W21 Supabase workdir is required}"
command -v psql >/dev/null
command -v supabase >/dev/null
command -v timeout >/dev/null

status_env="$(supabase status --workdir "$ZAVQERA_E2E_SUPABASE_WORKDIR" -o env)"
db_url="$(printf '%s\n' "$status_env" | sed -n 's/^DB_URL=//p' | tail -n 1)"
db_url="${db_url#\"}"
db_url="${db_url%\"}"
if [[ "$db_url" != postgres*://* ]]; then
  echo "W82 failed: no disposable local DB_URL." >&2
  exit 1
fi

user_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
request_id="w82-cross-month-race-$(python3 -c 'import secrets; print(secrets.token_hex(8))')"
request_hash="$(python3 -c 'import hashlib; print(hashlib.sha256(b"W82 cross-month race").hexdigest())')"
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
  psql "$db_url" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || true
delete from auth.users where id = '$user_id'::uuid;
SQL
}
trap cleanup EXIT

# These two independent PostgreSQL sessions deliberately use different month
# partitions but the same global (user_id, request_id) identity.
psql "$db_url" -X -q -v ON_ERROR_STOP=1 -c "insert into auth.users(id) values ('$user_id');"

run_insert() {
  local month="$1"
  local label="$2"
  timeout 30s psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/$label.log" 2>&1 <<SQL
begin;
insert into public.ai_usage_reservations(
  user_id, period_start, request_id, generation_kind, request_hash
) values (
  '$user_id'::uuid, date '$month', '$request_id', 'planner', '$request_hash'
)
on conflict (user_id, request_id) do nothing
returning id;
select pg_sleep(1.5);
commit;
SQL
}

run_insert "2026-10-01" session_october &
pid_a=$!
run_insert "2026-11-01" session_november &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

returned_ids="$(grep -hE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "$tmp_dir"/*.log || true)"
returned_count="$(printf '%s\n' "$returned_ids" | sed '/^$/d' | wc -l | tr -d ' ')"
row_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.ai_usage_reservations where user_id='$user_id'::uuid and request_id='$request_id';")"
period_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(distinct period_start) from public.ai_usage_reservations where user_id='$user_id'::uuid and request_id='$request_id';")"

if [[ "$returned_count" != "1" || "$row_count" != "1" || "$period_count" != "1" ]]; then
  echo "W82 failed: returned_ids=$returned_count rows=$row_count periods=$period_count; expected one global reservation." >&2
  cat "$tmp_dir"/*.log >&2
  exit 1
fi

echo "W82_CROSS_MONTH_GLOBAL_IDENTITY_RACE=PASS"
echo "independent_sessions=2"
echo "different_period_partitions=2"
echo "global_reservations=1"

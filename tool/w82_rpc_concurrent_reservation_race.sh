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
  echo "W82 RPC race failed: no disposable local DB_URL." >&2
  exit 1
fi

user_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
request_id="w82-rpc-race-$(python3 -c 'import secrets; print(secrets.token_hex(8))')"
request_hash="$(python3 -c 'import hashlib; print(hashlib.sha256(b"W82 RPC race input").hexdigest())')"
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
  psql "$db_url" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || true
delete from auth.users where id = '$user_id'::uuid;
SQL
}
trap cleanup EXIT

# The two independent sessions call the public authenticated RPC with the
# same request identity. The deliberate in-transaction pause keeps the first
# monthly-row lock held while the second session reaches the RPC.
psql "$db_url" -X -q -v ON_ERROR_STOP=1 -c "insert into auth.users(id) values ('$user_id'::uuid);"

run_reservation() {
  local label="$1"
  timeout 30s psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/$label.log" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$user_id', true);
select set_config('request.jwt.claims', '{"sub":"$user_id","role":"authenticated"}', true);
select concat_ws('|', allowed::text, coalesce(reservation_id::text, ''), coalesce(reason, ''))
  from public.reserve_ai_generation('$request_id', 'planner', '$request_hash');
select pg_sleep(1.5);
commit;
SQL
}

run_reservation session_a &
pid_a=$!
run_reservation session_b &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

rpc_results="$(grep -hE '^(true|false)\|' "$tmp_dir"/*.log || true)"
allowed_count="$(printf '%s\n' "$rpc_results" | awk -F'|' '$1 == "true" {n++} END {print n+0}')"
duplicate_count="$(printf '%s\n' "$rpc_results" | awk -F'|' '$1 == "false" && $3 == "duplicate_request" {n++} END {print n+0}')"
reservation_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.ai_usage_reservations where user_id='$user_id'::uuid and request_id='$request_id';")"
usage_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select coalesce(max(generations_used), 0) from public.ai_usage_monthly where user_id='$user_id'::uuid and period_start=date_trunc('month', timezone('utc', now()))::date;")"

if [[ "$allowed_count" != "1" || "$duplicate_count" != "1" || "$reservation_count" != "1" || "$usage_count" != "1" ]]; then
  echo "W82 RPC race failed: allowed=$allowed_count duplicate=$duplicate_count reservations=$reservation_count quota_used=$usage_count" >&2
  cat "$tmp_dir"/*.log >&2
  exit 1
fi

# Reusing the same request identity with different input must be rejected and
# must not create another reservation or charge another quota unit.
if psql "$db_url" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>"$tmp_dir/mismatch.log" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$user_id', true);
select set_config('request.jwt.claims', '{"sub":"$user_id","role":"authenticated"}', true);
select * from public.reserve_ai_generation('$request_id', 'planner', repeat('f', 64));
commit;
SQL
then
  echo "W82 RPC race failed: changed-input replay was accepted." >&2
  exit 1
fi
if ! grep -q 'AI_REQUEST_ID_REUSED_WITH_DIFFERENT_INPUT' "$tmp_dir/mismatch.log"; then
  echo "W82 RPC race failed: changed-input replay returned an unexpected error." >&2
  cat "$tmp_dir/mismatch.log" >&2
  exit 1
fi

reservation_count_after="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.ai_usage_reservations where user_id='$user_id'::uuid and request_id='$request_id';")"
usage_count_after="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select coalesce(max(generations_used), 0) from public.ai_usage_monthly where user_id='$user_id'::uuid and period_start=date_trunc('month', timezone('utc', now()))::date;")"
if [[ "$reservation_count_after" != "1" || "$usage_count_after" != "1" ]]; then
  echo "W82 RPC race failed: mismatch replay changed persisted accounting." >&2
  exit 1
fi

echo "W82_RPC_CONCURRENT_RESERVATION=PASS"
echo "entry_point=public.reserve_ai_generation"
echo "independent_sessions=2"
echo "allowed_results=$allowed_count"
echo "duplicate_results=$duplicate_count"
echo "reservation_rows=$reservation_count_after"
echo "monthly_generations_used=$usage_count_after"
echo "changed_input_replay=REJECTED"

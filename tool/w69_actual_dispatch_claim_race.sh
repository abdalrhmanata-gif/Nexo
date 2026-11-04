#!/usr/bin/env bash
set -euo pipefail

: "${ZAVQERA_E2E_SUPABASE_WORKDIR:?The disposable W21 Supabase workdir is required}"
: "${ZAVQERA_W69_CLAIM_EXECUTION_ID:?The W68 budget-race winner ID is required}"
command -v psql >/dev/null
command -v supabase >/dev/null
command -v timeout >/dev/null

status_env="$(supabase status --workdir "$ZAVQERA_E2E_SUPABASE_WORKDIR" -o env)"
db_url="$(printf '%s\n' "$status_env" | sed -n 's/^DB_URL=//p' | tail -n 1 | tr -d '"')"
if [[ "$db_url" != postgres*://* ]]; then
  echo "W69 failed: Supabase CLI did not return a usable local DB_URL." >&2
  exit 1
fi

execution_id="$ZAVQERA_W69_CLAIM_EXECUTION_ID"
if [[ ! "$execution_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "W69 failed: the provided execution ID is malformed." >&2
  exit 1
fi
requester_id="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select requested_by::text from public.agent_executions where id='$execution_id'::uuid;")"
if [[ ! "$requester_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "W69 failed: the execution requester could not be resolved." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

run_claim() {
  local label="$1"
  local rc=0
  if timeout 45s psql "$db_url" -X -q -A -t -v ON_ERROR_STOP=1 >"$tmp_dir/$label.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claim.sub', '$requester_id', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"sub":"$requester_id","role":"service_role"}', true);
set local role service_role;
select id from public.claim_agent_execution_dispatch('$execution_id'::uuid);
-- Keep the winner locked while the second independent session competes.
select pg_sleep(1.5);
commit;
SQL
  then rc=0; else rc=$?; fi
  printf '%s\n' "$rc" >"$tmp_dir/$label.status"
}

run_claim session_a &
pid_a=$!
run_claim session_b &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

status_a="$(cat "$tmp_dir/session_a.status")"
status_b="$(cat "$tmp_dir/session_b.status")"
if [[ "$status_a" == "0" && "$status_b" != "0" ]]; then
  loser_log="$tmp_dir/session_b.log"
elif [[ "$status_b" == "0" && "$status_a" != "0" ]]; then
  loser_log="$tmp_dir/session_a.log"
else
  echo "W69 failed: expected exactly one successful dispatch claim (A=$status_a, B=$status_b)." >&2
  cat "$tmp_dir/session_a.log" "$tmp_dir/session_b.log" >&2
  exit 1
fi
if ! grep -Fq "EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH" "$loser_log"; then
  echo "W69 failed: the losing independent session did not receive EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH." >&2
  cat "$tmp_dir/session_a.log" "$tmp_dir/session_b.log" >&2
  exit 1
fi

claim_state="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*)::text || ':' || count(dispatch_claimed_at)::text || ':' || count(dispatch_claim_request_hash)::text || ':' || count(dispatch_claim_authority_hash)::text from public.agent_executions where id='$execution_id'::uuid and status='RUNNING';")"
event_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.mission_events where event_type='AGENT_EXECUTION_DISPATCH_CLAIMED' and payload->>'execution_id'='$execution_id';")"
if [[ "$claim_state" != "1:1:1:1" || "$event_count" != "1" ]]; then
  echo "W69 failed: claim_state=$claim_state events=$event_count; expected one durable claim and one audit event." >&2
  exit 1
fi

echo "W69_ACTUAL_DISPATCH_CLAIM_RACE=PASS"
echo "actual_ledger_exactly_one_dispatch_claim=PASS"
echo "second_concurrent_claim_rejected=PASS"
echo "durable_claim_hashes_and_audit_event=PASS"

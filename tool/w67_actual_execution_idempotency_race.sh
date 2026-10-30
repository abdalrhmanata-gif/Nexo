#!/usr/bin/env bash
set -euo pipefail

: "${ZAVQERA_E2E_SUPABASE_WORKDIR:?The disposable W21 Supabase workdir is required}"
command -v psql >/dev/null
command -v supabase >/dev/null
command -v timeout >/dev/null

# Obtain the local-only DB URL from the disposable stack; never print it.
status_env="$(supabase status --workdir "$ZAVQERA_E2E_SUPABASE_WORKDIR" -o env)"
db_url="$(printf '%s\n' "$status_env" | sed -n 's/^DB_URL=//p' | tail -n 1)"
db_url="${db_url#\"}"
db_url="${db_url%\"}"
if [[ "$db_url" != postgres*://* ]]; then
  echo "W67 failed: Supabase CLI did not return a usable local DB_URL." >&2
  exit 1
fi

new_uuid() { python3 -c 'import uuid; print(uuid.uuid4())'; }
owner_id="$(new_uuid)"
workspace_id="$(new_uuid)"
mission_id="$(new_uuid)"
agent_id="$(new_uuid)"
run_token="$(python3 -c 'import secrets; print(secrets.token_hex(12))')"
idempotency_key="w67-actual-ledger-${run_token}"
request_json='{"purpose":"W67 concurrent actual-ledger idempotency proof"}'
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

# This fixture only exists in the disposable local Supabase stack that W21
# always tears down. No hosted Development or production credentials are used.
psql "$db_url" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users(id) values ('$owner_id');
insert into public.workspaces(id, owner_id, name)
values ('$workspace_id', '$owner_id', 'W67 disposable execution race');
insert into public.workspace_members(workspace_id, user_id, role)
values ('$workspace_id', '$owner_id', 'owner');
insert into public.missions(id, workspace_id, owner_id, objective, status)
values ('$mission_id', '$workspace_id', '$owner_id', 'Prove actual-ledger idempotency', 'READY');
insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
values (
  '$agent_id', '$workspace_id', 'W67 read-only test agent',
  'Disposable actual-ledger idempotency test', 'ACTIVE',
  '{"mode":"read_only","requires_approval":false,"external_side_effects":false}'::jsonb,
  '$owner_id'
);
SQL

run_start() {
  local label="$1"
  local rc=0
  if timeout 45s psql "$db_url" -X -q -A -t -v ON_ERROR_STOP=1 >"$tmp_dir/$label.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
select pg_sleep(0.25);
select id
  from public.start_agent_execution(
    '$mission_id'::uuid,
    null::uuid,
    '$agent_id'::uuid,
    '$idempotency_key',
    '$request_json'::jsonb
  );
-- Keep the winning transaction open long enough for the independent session
-- to contend on the same mission row and then observe the existing key.
select pg_sleep(1.5);
commit;
SQL
  then
    rc=0
  else
    rc=$?
  fi
  printf '%s\n' "$rc" >"$tmp_dir/$label.status"
}

# Separate psql processes guarantee independent PostgreSQL sessions.
run_start session_a &
pid_a=$!
run_start session_b &
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
  echo "W67 failed: expected exactly one successful concurrent start (status A=$status_a, B=$status_b)." >&2
  cat "$tmp_dir/session_a.log" "$tmp_dir/session_b.log" >&2
  exit 1
fi
if ! grep -Fq "EXECUTION_ALREADY_EXISTS" "$loser_log"; then
  echo "W67 failed: the losing independent session did not receive EXECUTION_ALREADY_EXISTS." >&2
  cat "$tmp_dir/session_a.log" "$tmp_dir/session_b.log" >&2
  exit 1
fi

attempt_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.agent_executions where workspace_id='$workspace_id'::uuid and idempotency_key='$idempotency_key';")"
event_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.mission_events where mission_id='$mission_id'::uuid and event_type='AGENT_EXECUTION_STARTED' and payload->>'idempotency_key'='$idempotency_key';")"
if [[ "$attempt_count" != "1" || "$event_count" != "1" ]]; then
  echo "W67 failed: actual ledger contains attempts=$attempt_count and start_events=$event_count; expected one of each." >&2
  cat "$tmp_dir/session_a.log" "$tmp_dir/session_b.log" >&2
  exit 1
fi

expect_refusal() {
  local label="$1"
  local candidate_request="$2"
  local expected_error="$3"
  local rc=0
  if timeout 30s psql "$db_url" -X -q -A -t -v ON_ERROR_STOP=1 >"$tmp_dir/$label.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
select id
  from public.start_agent_execution(
    '$mission_id'::uuid,
    null::uuid,
    '$agent_id'::uuid,
    '$idempotency_key',
    '$candidate_request'::jsonb
  );
commit;
SQL
  then
    rc=0
  else
    rc=$?
  fi
  if [[ "$rc" == "0" ]] || ! grep -Fq "$expected_error" "$tmp_dir/$label.log"; then
    echo "W67 failed: $label did not fail closed with $expected_error." >&2
    cat "$tmp_dir/$label.log" >&2
    exit 1
  fi
}

expect_refusal exact_replay "$request_json" "EXECUTION_ALREADY_EXISTS"
expect_refusal changed_request '{"purpose":"W67 changed content under same key"}' "EXECUTION_IDEMPOTENCY_BINDING_MISMATCH"

attempt_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.agent_executions where workspace_id='$workspace_id'::uuid and idempotency_key='$idempotency_key';")"
event_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.mission_events where mission_id='$mission_id'::uuid and event_type='AGENT_EXECUTION_STARTED' and payload->>'idempotency_key'='$idempotency_key';")"
if [[ "$attempt_count" != "1" || "$event_count" != "1" ]]; then
  echo "W67 failed: replay changed durable rows (attempts=$attempt_count, start_events=$event_count)." >&2
  exit 1
fi

echo "W67_ACTUAL_LEDGER_IDEMPOTENCY_RACE=PASS"
echo "actual_start_same_key_concurrency=PASS"
echo "actual_start_replay_refusal=PASS"
echo "actual_start_changed_request_refusal=PASS"
echo "W67_BUDGET_RESERVATION=SEPARATE_W68_GATE (see tool/w68_actual_authority_budget_race.sh)"

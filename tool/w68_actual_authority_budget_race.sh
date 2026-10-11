#!/usr/bin/env bash
set -euo pipefail

: "$ZAVQERA_E2E_SUPABASE_WORKDIR"
test -n "$ZAVQERA_E2E_SUPABASE_WORKDIR"
command -v psql >/dev/null
command -v supabase >/dev/null
command -v timeout >/dev/null

# Read only the loopback URL of the disposable W21 Supabase stack; never print it.
status_env="$(supabase status --workdir "$ZAVQERA_E2E_SUPABASE_WORKDIR" -o env)"
db_url="$(printf '%s\n' "$status_env" | sed -n 's/^DB_URL=//p' | tail -n 1 | tr -d '"')"
if [[ "$db_url" != postgres*://* ]]; then
  echo "W68 failed: Supabase CLI did not return a usable local DB_URL." >&2
  exit 1
fi

new_uuid() { python3 -c 'import uuid; print(uuid.uuid4())'; }
owner_id="$(new_uuid)"
other_id="$(new_uuid)"
workspace_id="$(new_uuid)"
mission_id="$(new_uuid)"
agent_id="$(new_uuid)"
action_a="$(new_uuid)"
action_b="$(new_uuid)"
run_token="$(python3 -c 'import secrets; print(secrets.token_hex(12))')"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

psql "$db_url" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
insert into auth.users(id) values ('$owner_id'), ('$other_id');
insert into public.workspaces(id, owner_id, name)
values ('$workspace_id', '$owner_id', 'W68 disposable actual-budget race');
insert into public.workspace_members(workspace_id, user_id, role)
values ('$workspace_id', '$owner_id', 'owner'), ('$workspace_id', '$other_id', 'member');
insert into public.missions(id, workspace_id, owner_id, objective, status)
values ('$mission_id', '$workspace_id', '$owner_id', 'Prove actual budget reservation race', 'READY');
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
insert into public.mission_actions(id, mission_id, title, position, status)
values
  ('$action_a', '$mission_id', 'W68 concurrent action A', 0, 'PENDING'),
  ('$action_b', '$mission_id', 'W68 concurrent action B', 1, 'PENDING');
insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
values ('$agent_id', '$workspace_id', 'W68 budget race agent',
  'Disposable actual-ledger budget race', 'ACTIVE',
  '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb,
  '$owner_id');
commit;
SQL

# A non-admin cannot mint or enlarge the budget.
set +e
psql "$db_url" -X -q -v ON_ERROR_STOP=1 >"$tmp_dir/nonadmin.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claim.sub', '$other_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$other_id","role":"authenticated"}', true);
set local role authenticated;
select public.configure_mission_authority_budget(
  '$workspace_id'::uuid, '$mission_id'::uuid, '$agent_id'::uuid,
  100, 10000, 100, 'USD', clock_timestamp() + interval '1 hour',
  clock_timestamp() - interval '1 minute'
);
commit;
SQL
nonadmin_rc=$?
set -e
if [[ "$nonadmin_rc" == "0" ]] || ! grep -Fq "AUTHORITY_BUDGET_ADMIN_REQUIRED" "$tmp_dir/nonadmin.log"; then
  echo "W68 failed: non-admin budget configuration was not rejected." >&2
  cat "$tmp_dir/nonadmin.log" >&2
  exit 1
fi

budget_output="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 <<SQL
begin;
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
select (public.configure_mission_authority_budget(
  '$workspace_id'::uuid, '$mission_id'::uuid, '$agent_id'::uuid,
  1, 10, 10, 'USD', clock_timestamp() + interval '1 hour',
  clock_timestamp() - interval '1 minute'
) ->> 'authority_revision')::bigint;
commit;
SQL
)"
budget_revision="$(printf '%s\n' "$budget_output" | grep -E '^[0-9]+$' | tail -n 1)"
if [[ -z "$budget_revision" ]]; then
  echo "W68 failed: guarded budget configuration did not return a revision." >&2
  exit 1
fi

request_a="$(printf '{"authority_budget_revision":%s,"destination":"https://example.invalid/w68/race-a","audience":"w68-race-provider","summary":"Authorize concurrent budget action A","payload":{"operation":"A"}}' "$budget_revision")"
request_b="$(printf '{"authority_budget_revision":%s,"destination":"https://example.invalid/w68/race-b","audience":"w68-race-provider","summary":"Authorize concurrent budget action B","payload":{"operation":"B"}}' "$budget_revision")"

psql "$db_url" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
do \$approvals\$
declare
  v_approval public.mission_approvals;
begin
  select * into v_approval from public.request_mission_approval(
    '$mission_id'::uuid, '$action_a'::uuid,
    jsonb_build_object(
      'schema_version', 1, 'type', 'agent_execution_binding_v1',
      'agent_id', '$agent_id'::uuid, 'request', '$request_a'::jsonb
    )
  );
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);
  select * into v_approval from public.request_mission_approval(
    '$mission_id'::uuid, '$action_b'::uuid,
    jsonb_build_object(
      'schema_version', 1, 'type', 'agent_execution_binding_v1',
      'agent_id', '$agent_id'::uuid, 'request', '$request_b'::jsonb
    )
  );
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);
end
\$approvals\$;
commit;
SQL

run_start() {
  local label="$1"
  local action_id="$2"
  local key="$3"
  local request_json="$4"
  local rc=0
  if timeout 45s psql "$db_url" -X -q -A -t -v ON_ERROR_STOP=1 >"$tmp_dir/$label.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
select pg_sleep(0.25);
select id from public.start_agent_execution(
  '$mission_id'::uuid,
  '$action_id'::uuid,
  '$agent_id'::uuid,
  '$key',
  '$request_json'::jsonb
);
-- Hold the winning transaction while the other independent session competes
-- for the same single remaining action allowance.
select pg_sleep(1.5);
commit;
SQL
  then rc=0; else rc=$?; fi
  printf '%s\n' "$rc" >"$tmp_dir/$label.status"
}

run_start session_a "$action_a" "w68-budget-race-a-$run_token" "$request_a" &
pid_a=$!
run_start session_b "$action_b" "w68-budget-race-b-$run_token" "$request_b" &
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
  echo "W68 failed: expected exactly one successful start (status A=$status_a, B=$status_b)." >&2
  cat "$tmp_dir/session_a.log" "$tmp_dir/session_b.log" >&2
  exit 1
fi
if ! grep -Fq "AUTHORITY_BUDGET_EXHAUSTED" "$loser_log"; then
  echo "W68 failed: the losing independent session did not receive AUTHORITY_BUDGET_EXHAUSTED." >&2
  cat "$tmp_dir/session_a.log" "$tmp_dir/session_b.log" >&2
  exit 1
fi

attempt_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.agent_executions where workspace_id='$workspace_id'::uuid and mission_id='$mission_id'::uuid;")"
reservation_count="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.mission_authority_budget_reservations r join public.agent_executions e on e.id=r.execution_id where e.workspace_id='$workspace_id'::uuid and e.mission_id='$mission_id'::uuid and r.status='RESERVED';")"
budget_state="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select action_limit::text || ':' || actions_reserved::text || ':' || actions_consumed::text || ':' || spend_reserved::text || ':' || spend_consumed::text from public.mission_authority_budgets where workspace_id='$workspace_id'::uuid and mission_id='$mission_id'::uuid and agent_id='$agent_id'::uuid and status='ACTIVE';")"
if [[ "$attempt_count" != "1" || "$reservation_count" != "1" || "$budget_state" != "1:1:0:10.000000:0.000000" ]]; then
  echo "W68 failed: attempts=$attempt_count reservations=$reservation_count budget=$budget_state; expected one durable reservation against a one-action budget." >&2
  exit 1
fi

echo "W68_ACTUAL_AUTHORITY_BUDGET_RACE=PASS"
echo "non_admin_budget_configuration_denied=PASS"
echo "actual_ledger_one_winner_for_one_action_unit=PASS"
echo "budget_reservation_atomic_with_start=PASS"
echo "reserved_spend_preserved=PASS"

#!/usr/bin/env bash
set -euo pipefail

: "${ZAVQERA_E2E_SUPABASE_WORKDIR:?The disposable W21 Supabase workdir is required}"
command -v psql >/dev/null
command -v supabase >/dev/null
command -v node >/dev/null
command -v timeout >/dev/null

# This integration gate talks only to the disposable loopback Supabase stack.
# Provider behavior below is a local fake adapter; no external provider request is made.
status_env="$(supabase status --workdir "$ZAVQERA_E2E_SUPABASE_WORKDIR" -o env)"
read_status_value() {
  printf '%s\n' "$status_env" | sed -n "s/^$1=//p" | tail -n 1 | sed 's/^"//;s/"$//' 
}
db_url="$(read_status_value DB_URL)"
api_url="$(read_status_value API_URL)"
service_role_key="$(read_status_value SERVICE_ROLE_KEY)"
if [[ "$db_url" != postgres*://* || -z "$service_role_key" || -z "$api_url" ]]; then
  echo "W72 failed: the disposable Supabase status did not expose required local values." >&2
  exit 1
fi
case "$api_url" in
  http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) ;;
  *) echo "W72 failed: refusing a non-loopback API URL." >&2; exit 1 ;;
esac

new_uuid() { python3 -c 'import uuid; print(uuid.uuid4())'; }
owner_id="$(new_uuid)"
workspace_id="$(new_uuid)"
mission_id="$(new_uuid)"
agent_id="$(new_uuid)"
success_action_id="$(new_uuid)"
unknown_action_id="$(new_uuid)"
run_token="$(python3 -c 'import secrets; print(secrets.token_hex(12))')"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

psql "$db_url" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
insert into auth.users(id) values ('$owner_id');
insert into public.workspaces(id, owner_id, name)
values ('$workspace_id', '$owner_id', 'W72 persistent gateway integration');
insert into public.workspace_members(workspace_id, user_id, role)
values ('$workspace_id', '$owner_id', 'owner');
insert into public.missions(id, workspace_id, owner_id, objective, status)
values ('$mission_id', '$workspace_id', '$owner_id', 'Prove gateway + real SQL boundary with fake provider', 'READY');
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
insert into public.mission_actions(id, mission_id, title, position, status)
values
  ('$success_action_id', '$mission_id', 'W72 fake success action', 0, 'PENDING'),
  ('$unknown_action_id', '$mission_id', 'W72 uncertain action', 1, 'PENDING');
insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
values ('$agent_id', '$workspace_id', 'W72 fake provider agent',
  'Disposable test-only agent; no external provider is configured.', 'ACTIVE',
  '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb,
  '$owner_id');
commit;
SQL

budget_output="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 <<SQL
begin;
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
select (public.configure_mission_authority_budget(
  '$workspace_id'::uuid, '$mission_id'::uuid, '$agent_id'::uuid,
  2, 20, 10, 'USD', clock_timestamp() + interval '1 hour',
  clock_timestamp() - interval '1 minute'
) ->> 'authority_revision');
commit;
SQL
)"
budget_revision="$(printf '%s\n' "$budget_output" | grep -E '^[0-9]+$' | tail -n 1)"
if [[ -z "$budget_revision" ]]; then
  echo "W72 failed: could not configure a bounded disposable budget." >&2
  exit 1
fi

success_request="$(printf '{"authority_budget_revision":%s,"destination":"https://example.invalid/w72/success","audience":"w72-fake-provider.v1","summary":"Run the W72 fake success integration","payload":{"operation":"fake-success"}}' "$budget_revision")"
unknown_request="$(printf '{"authority_budget_revision":%s,"destination":"https://example.invalid/w72/unknown","audience":"w72-fake-provider.v1","summary":"Run the W72 uncertain outcome integration","payload":{"operation":"fake-unknown"}}' "$budget_revision")"

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
    '$mission_id'::uuid, '$success_action_id'::uuid,
    jsonb_build_object(
      'schema_version', 1,
      'type', 'agent_execution_binding_v1',
      'agent_id', '$agent_id'::uuid,
      'request', '$success_request'::jsonb
    )
  );
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);

  select * into v_approval from public.request_mission_approval(
    '$mission_id'::uuid, '$unknown_action_id'::uuid,
    jsonb_build_object(
      'schema_version', 1,
      'type', 'agent_execution_binding_v1',
      'agent_id', '$agent_id'::uuid,
      'request', '$unknown_request'::jsonb
    )
  );
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);
end
\$approvals\$;
commit;
SQL

start_execution() {
  local action_id="$1"
  local key="$2"
  local request_json="$3"
  psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 <<SQL
begin;
select set_config('request.jwt.claim.sub', '$owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"$owner_id","role":"authenticated"}', true);
set local role authenticated;
select id::text from public.start_agent_execution(
  '$mission_id'::uuid, '$action_id'::uuid, '$agent_id'::uuid, '$key', '$request_json'::jsonb
);
commit;
SQL
}

success_execution_id="$(start_execution "$success_action_id" "w72-success-$run_token" "$success_request" | grep -E '^[0-9a-f-]{36}$' | tail -n 1)"
unknown_execution_id="$(start_execution "$unknown_action_id" "w72-unknown-$run_token" "$unknown_request" | grep -E '^[0-9a-f-]{36}$' | tail -n 1)"
if [[ ! "$success_execution_id" =~ ^[0-9a-f-]{36}$ || ! "$unknown_execution_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "W72 failed: could not create both budgeted, approved disposable attempts." >&2
  exit 1
fi

ZAVQERA_W72_SUPABASE_URL="$api_url" \
ZAVQERA_W72_SERVICE_ROLE_KEY="$service_role_key" \
ZAVQERA_W72_SUCCESS_EXECUTION_ID="$success_execution_id" \
ZAVQERA_W72_UNKNOWN_EXECUTION_ID="$unknown_execution_id" \
  node "$GITHUB_WORKSPACE/apps/web/test/persistent-dispatch-gateway-postgres.integration.mjs"

success_state="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c \
  "select e.status || ':' || r.status from public.agent_executions e join public.mission_authority_budget_reservations r on r.execution_id=e.id where e.id='$success_execution_id'::uuid;")"
unknown_state="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c \
  "select e.status || ':' || r.status from public.agent_executions e join public.mission_authority_budget_reservations r on r.execution_id=e.id where e.id='$unknown_execution_id'::uuid;")"
budget_state="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c \
  "select action_limit::text || ':' || actions_reserved::text || ':' || actions_consumed::text || ':' || spend_reserved::text || ':' || spend_consumed::text from public.mission_authority_budgets where workspace_id='$workspace_id'::uuid and mission_id='$mission_id'::uuid and agent_id='$agent_id'::uuid and status='ACTIVE';")"
dispatch_events="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c \
  "select count(*) from public.mission_events where event_type='AGENT_EXECUTION_DISPATCH_CLAIMED' and payload->>'execution_id' in ('$success_execution_id','$unknown_execution_id');")"
reconciliation_events="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c \
  "select count(*) from public.mission_events where event_type='AGENT_EXECUTION_RECONCILIATION_CLAIMED' and payload->>'execution_id'='$unknown_execution_id';")"

if [[ "$success_state" != "SUCCEEDED:CONSUMED" ]]; then
  echo "W72 failed: success attempt did not settle with its budget reservation (state=$success_state)." >&2
  exit 1
fi
if [[ "$unknown_state" != "FAILED:RELEASED" ]]; then
  echo "W72 failed: authoritative no-send reconciliation did not release the held reservation (state=$unknown_state)." >&2
  exit 1
fi
if [[ "$budget_state" != "2:0:1:0.000000:2.000000" ]]; then
  echo "W72 failed: final authority budget counters are incorrect (state=$budget_state)." >&2
  exit 1
fi
if [[ "$dispatch_events" != "2" || "$reconciliation_events" != "1" ]]; then
  echo "W72 failed: durable audit event counts are incorrect (dispatch=$dispatch_events reconciliation=$reconciliation_events)." >&2
  exit 1
fi

echo "W72_PERSISTENT_GATEWAY_POSTGRES_INTEGRATION=PASS"
echo "actual_postgres_success_and_budget_settlement=PASS"
echo "unknown_to_no_send_reconciliation_without_redispatch=PASS"
echo "durable_dispatch_and_reconciliation_audit=PASS"

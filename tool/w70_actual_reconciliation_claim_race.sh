#!/usr/bin/env bash
set -euo pipefail
: "${ZAVQERA_E2E_SUPABASE_WORKDIR:?The disposable W21 Supabase workdir is required}"
command -v psql >/dev/null; command -v supabase >/dev/null; command -v timeout >/dev/null
status_env="$(supabase status --workdir "$ZAVQERA_E2E_SUPABASE_WORKDIR" -o env)"
db_url="$(printf '%s\n' "$status_env" | sed -n 's/^DB_URL=//p' | tail -n 1 | tr -d '\"')"
[[ "$db_url" == postgres*://* ]] || { echo "W70 failed: unusable disposable DB_URL." >&2; exit 1; }
new_uuid() { python3 -c 'import uuid; print(uuid.uuid4())'; }
owner="$(new_uuid)"; workspace="$(new_uuid)"; mission="$(new_uuid)"; agent="$(new_uuid)"
action="$(new_uuid)"; budget="$(new_uuid)"; execution="$(new_uuid)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
psql "$db_url" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
insert into auth.users(id) values ('$owner');
insert into public.workspaces(id,owner_id,name) values ('$workspace','$owner','W70 actual reconciliation race');
insert into public.workspace_members(workspace_id,user_id,role) values ('$workspace','$owner','owner');
insert into public.missions(id,workspace_id,owner_id,objective,status) values ('$mission','$workspace','$owner','Prove one reconciliation claimant','READY');
insert into public.mission_actions(id,mission_id,title,position,status) values ('$action','$mission','W70 reconciliation action',0,'PENDING');
insert into public.workspace_agents(id,workspace_id,name,description,status,authority,created_by)
values ('$agent','$workspace','W70 reconciliation race agent','Disposable race test','ACTIVE',
'{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb,'$owner');
insert into public.mission_authority_budgets(
 id,workspace_id,mission_id,agent_id,authority_revision,authority_hash,status,not_before,expires_at,
 action_limit,actions_reserved,actions_consumed,max_spend,max_spend_per_action,spend_reserved,spend_consumed,currency,created_by
) values ('$budget','$workspace','$mission','$agent',1,repeat('a',64),'ACTIVE',
 clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',10,1,0,10,10,10,0,'USD','$owner');
insert into public.agent_executions(
 id,workspace_id,mission_id,action_id,agent_id,requested_by,idempotency_key,status,
 authority_snapshot,request,evidence,lease_expires_at,completed_at,reconciled_at
) values ('$execution','$workspace','$mission','$action','$agent','$owner','w70-actual-reconciliation-key-0001','UNKNOWN',
 '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb,
 '{"destination":"https://provider.example.test/w70-race","audience":"provider.operation.v1"}'::jsonb,
 '{"outcome":"UNKNOWN","reconciliation_required":true}'::jsonb,
 clock_timestamp()-interval '1 minute',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '30 seconds');
insert into public.mission_authority_budget_reservations(budget_id,execution_id,reserved_actions,reserved_spend,currency,status)
values ('$budget','$execution',1,10,'USD','HELD_UNKNOWN');
commit;
SQL
claim() {
 local label="$1" rc=0
 if timeout 45s psql "$db_url" -X -q -A -t -v ON_ERROR_STOP=1 >"$tmp/$label.log" 2>&1 <<SQL
begin;
select set_config('request.jwt.claim.sub','$owner',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"sub":"$owner","role":"service_role"}',true);
set local role service_role;
select id from public.claim_agent_execution_reconciliation('$execution'::uuid);
select pg_sleep(1.5);
commit;
SQL
 then rc=0; else rc=$?; fi
 printf '%s\n' "$rc" >"$tmp/$label.status"
}
claim a & pa=$!; claim b & pb=$!; wait "$pa"; wait "$pb"
sa="$(cat "$tmp/a.status")"; sb="$(cat "$tmp/b.status")"
if [[ "$sa" == "0" && "$sb" != "0" ]]; then loser="$tmp/b.log"
elif [[ "$sb" == "0" && "$sa" != "0" ]]; then loser="$tmp/a.log"
else echo "W70 failed: expected one claim (A=$sa B=$sb)." >&2; cat "$tmp"/*.log >&2; exit 1; fi
grep -Fq "EXECUTION_RECONCILIATION_ALREADY_CLAIMED" "$loser" || { cat "$tmp"/*.log >&2; exit 1; }
state="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*)::text||':'||count(reconciliation_claim_token)::text||':'||count(case when reconciliation_lease_expires_at>clock_timestamp() then 1 end)::text from public.agent_executions where id='$execution'::uuid and status='UNKNOWN';")"
events="$(psql "$db_url" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.mission_events where event_type='AGENT_EXECUTION_RECONCILIATION_CLAIMED' and payload->>'execution_id'='$execution';")"
[[ "$state" == "1:1:1" && "$events" == "1" ]] || { echo "W70 failed: state=$state events=$events" >&2; exit 1; }
echo "W70_ACTUAL_RECONCILIATION_CLAIM_RACE=PASS"
echo "actual_ledger_exactly_one_reconciliation_claim=PASS"
echo "second_concurrent_reconciliation_rejected=PASS"
echo "durable_reconciliation_lease_and_audit_event=PASS"

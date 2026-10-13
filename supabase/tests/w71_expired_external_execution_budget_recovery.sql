-- W71: expired external attempts enter durable W70 reconciliation with budget held.
begin;
create extension if not exists pgtap;
select plan(10);

select ok(to_regprocedure('private.reconcile_stale_agent_execution(uuid)') is not null,
  'private stale-execution recovery function exists');
select ok(
  (select prosecdef from pg_proc where oid = 'private.reconcile_stale_agent_execution(uuid)'::regprocedure)
  and coalesce(array_to_string((select proconfig from pg_proc where oid = 'private.reconcile_stale_agent_execution(uuid)'::regprocedure), '|'), '')
    like '%search_path=pg_catalog, public, private%',
  'stale-execution recovery is SECURITY DEFINER with a pinned search path');
select ok(
  to_regprocedure('public.reconcile_stale_agent_execution(uuid)') is not null
  and not (select prosecdef from pg_proc where oid = 'public.reconcile_stale_agent_execution(uuid)'::regprocedure)
  and has_function_privilege('authenticated', 'public.reconcile_stale_agent_execution(uuid)', 'EXECUTE'),
  'the public recovery wrapper remains SECURITY INVOKER and is authenticated-only');

select ok(
  position('private.workspace_role(v_initial.workspace_id) is null' in lower(pg_get_functiondef('private.reconcile_stale_agent_execution(uuid)'::regprocedure))) > 0
  and position('private.workspace_role(v_execution.workspace_id) is null' in lower(pg_get_functiondef('private.reconcile_stale_agent_execution(uuid)'::regprocedure))) > 0,
  'stale recovery rejects a missing workspace role before changing execution or budget state');

create temporary table w71_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_outsider_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_action_with_budget uuid := gen_random_uuid();
  v_action_without_budget uuid := gen_random_uuid();
  v_budget_id uuid := gen_random_uuid();
  v_execution_id uuid := gen_random_uuid();
  v_missing_budget_execution_id uuid := gen_random_uuid();
  v_authority jsonb := '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb;
  v_budget public.mission_authority_budgets;
  v_reservation public.mission_authority_budget_reservations;
  v_execution public.agent_executions;
  v_claim public.agent_executions;
  v_caught boolean;
begin
  insert into auth.users(id) values (v_owner), (v_outsider);
  insert into public.workspaces(id, owner_id, name)
  values
    (v_workspace, v_owner, 'W71 expired external reservation recovery'),
    (v_outsider_workspace, v_outsider, 'W71 separate outsider workspace');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner'), (v_outsider_workspace, v_outsider, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Recover expired external execution budget', 'READY');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  insert into public.mission_actions(id, mission_id, title, position, status)
  values
    (v_action_with_budget, v_mission, 'W71 action with reservation', 0, 'PENDING'),
    (v_action_without_budget, v_mission, 'W71 action missing reservation', 1, 'PENDING');

  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W71 bounded agent', 'Disposable recovery test agent', 'ACTIVE', v_authority, v_owner);

  insert into public.mission_authority_budgets(
    id, workspace_id, mission_id, agent_id, authority_revision, authority_hash, status,
    not_before, expires_at, action_limit, actions_reserved, actions_consumed,
    max_spend, max_spend_per_action, spend_reserved, spend_consumed, currency, created_by
  ) values (
    v_budget_id, v_workspace, v_mission, v_agent, 1,
    encode(extensions.digest(convert_to(v_authority::text, 'UTF8'), 'sha256'), 'hex'),
    'ACTIVE', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour',
    5, 1, 0, 50, 10, 10, 0, 'NOK', v_owner
  );

  insert into public.agent_executions(
    id, workspace_id, mission_id, action_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, heartbeat_at, lease_expires_at, attempt_number,
    dispatch_claimed_at, dispatch_claim_authority_hash, dispatch_claim_request_hash,
    dispatch_claim_budget_revision
  ) values (
    v_execution_id, v_workspace, v_mission, v_action_with_budget, v_agent, v_owner,
    'w71-expired-external-attempt-key-0001', 'RUNNING', v_authority,
    jsonb_build_object(
      'authority_budget_revision', '1',
      'destination', 'https://provider.example.test/w71/held',
      'audience', 'provider.operation.v1',
      'summary', 'Recover a stale dispatch attempt'
    ),
    clock_timestamp() - interval '7 minutes', clock_timestamp() - interval '1 minute', 1,
    clock_timestamp() - interval '2 minutes', repeat('a', 64), repeat('b', 64), 1
  );

  insert into public.mission_authority_budget_reservations(
    budget_id, execution_id, reserved_actions, reserved_spend, currency, status
  ) values (v_budget_id, v_execution_id, 1, 10, 'NOK', 'RESERVED');

  insert into public.agent_executions(
    id, workspace_id, mission_id, action_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, heartbeat_at, lease_expires_at, attempt_number
  ) values (
    v_missing_budget_execution_id, v_workspace, v_mission, v_action_without_budget, v_agent, v_owner,
    'w71-missing-reservation-attempt-key-0001', 'RUNNING', v_authority,
    jsonb_build_object(
      'authority_budget_revision', '1',
      'destination', 'https://provider.example.test/w71/missing',
      'audience', 'provider.operation.v1',
      'summary', 'Fail closed when reservation is missing'
    ),
    clock_timestamp() - interval '7 minutes', clock_timestamp() - interval '1 minute', 1
  );

  select * into v_execution from public.reconcile_stale_agent_execution(v_execution_id);
  select * into v_reservation from public.mission_authority_budget_reservations where execution_id = v_execution_id;
  select * into v_budget from public.mission_authority_budgets where id = v_budget_id;
  insert into w71_behavior_results values ('external_attempt_becomes_unknown_and_held',
    v_execution.status = 'UNKNOWN'
    and v_execution.evidence ->> 'outcome' = 'unknown'
    and v_execution.evidence ->> 'safe_to_retry' = 'false'
    and v_execution.evidence ->> 'reconciliation_required' = 'true'
    and v_reservation.status = 'HELD_UNKNOWN'
    and v_execution.reconciled_at is not null);

  insert into w71_behavior_results values ('budget_counters_remain_reserved',
    v_budget.actions_reserved = 1 and v_budget.actions_consumed = 0
    and v_budget.spend_reserved = 10 and v_budget.spend_consumed = 0
    and v_reservation.reserved_actions = 1 and v_reservation.reserved_spend = 10
    and v_reservation.settled_at is null);

  insert into w71_behavior_results values ('mission_history_records_budget_hold', exists (
    select 1 from public.mission_events
     where mission_id = v_mission
       and event_type = 'AGENT_EXECUTION_RECONCILED'
       and payload ->> 'execution_id' = v_execution_id::text
       and payload ->> 'budget_reservation_status' = 'HELD_UNKNOWN'
       and payload ->> 'reconciliation_required' = 'true'
  ));

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);
  select * into v_claim from public.claim_agent_execution_reconciliation(v_execution_id);
  insert into w71_behavior_results values ('w70_claim_succeeds_after_stale_recovery',
    v_claim.status = 'UNKNOWN'
    and v_claim.reconciliation_claim_token is not null
    and v_claim.reconciliation_lease_expires_at > clock_timestamp());

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin
    perform public.reconcile_stale_agent_execution(v_missing_budget_execution_id);
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_BUDGET_RESERVATION_NOT_OPEN' then
      v_caught := true;
    else
      raise;
    end if;
  end;
  select * into v_execution from public.agent_executions where id = v_missing_budget_execution_id;
  insert into w71_behavior_results values ('missing_external_reservation_fails_closed',
    v_caught and v_execution.status = 'RUNNING');

  -- A separate authenticated workspace owner must be denied before the stale
  -- execution state or its budget reservation can be inspected or mutated.
  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_caught := false;
  begin
    perform public.reconcile_stale_agent_execution(v_missing_budget_execution_id);
  exception when sqlstate '42501' then
    if sqlerrm = 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' then v_caught := true; else raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  select * into v_execution from public.agent_executions where id = v_missing_budget_execution_id;
  insert into w71_behavior_results values ('cross_workspace_recovery_denied',
    v_caught and v_execution.status = 'RUNNING');

end;
$behavior$;

select ok((select passed from w71_behavior_results where name = 'external_attempt_becomes_unknown_and_held'),
  'expired side-effect execution becomes UNKNOWN with a HELD_UNKNOWN budget reservation');
select ok((select passed from w71_behavior_results where name = 'budget_counters_remain_reserved'),
  'UNKNOWN recovery neither releases nor double-charges action/spend allowance');
select ok((select passed from w71_behavior_results where name = 'mission_history_records_budget_hold'),
  'mission history explicitly records the held reservation and reconciliation requirement');
select ok((select passed from w71_behavior_results where name = 'w70_claim_succeeds_after_stale_recovery'),
  'the durable W70 reconciliation claimant can claim an execution recovered by W71');
select ok((select passed from w71_behavior_results where name = 'missing_external_reservation_fails_closed'),
  'missing reservation prevents a false UNKNOWN transition and leaves execution recoverable');
select ok((select passed from w71_behavior_results where name = 'cross_workspace_recovery_denied'),
  'an owner of another workspace cannot reconcile or mutate the target execution');

select * from finish();
rollback;

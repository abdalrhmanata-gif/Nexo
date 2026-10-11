-- W70: only a trusted leased worker can settle UNKNOWN external outcomes.
begin;
create extension if not exists pgtap;
select plan(17);

select ok(to_regprocedure('public.claim_agent_execution_reconciliation(uuid)') is not null,
  'trusted reconciliation-claim RPC exists');
select ok(to_regprocedure('public.reconcile_agent_execution_outcome(uuid,uuid,text,jsonb,jsonb)') is not null,
  'trusted reconciliation outcome RPC exists');
select ok(not has_function_privilege('authenticated',
  'public.claim_agent_execution_reconciliation(uuid)', 'EXECUTE'),
  'authenticated callers cannot claim reconciliation');
select ok(not has_function_privilege('authenticated',
  'public.reconcile_agent_execution_outcome(uuid,uuid,text,jsonb,jsonb)', 'EXECUTE'),
  'authenticated callers cannot finalize reconciliation');
select ok(has_function_privilege('service_role',
  'public.claim_agent_execution_reconciliation(uuid)', 'EXECUTE'),
  'trusted workers can claim reconciliation');
select ok(has_function_privilege('service_role',
  'public.reconcile_agent_execution_outcome(uuid,uuid,text,jsonb,jsonb)', 'EXECUTE'),
  'trusted workers can settle reconciled outcomes');
select ok(not has_function_privilege('authenticated',
  'private.claim_agent_execution_reconciliation(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'private.reconcile_agent_execution_outcome(uuid,uuid,text,jsonb,jsonb)', 'EXECUTE'),
  'authenticated callers cannot bypass the private reconciliation boundary');
select ok((select count(*) = 3 from information_schema.columns
  where table_schema = 'public' and table_name = 'agent_executions'
    and column_name in ('reconciliation_claimed_at','reconciliation_lease_expires_at','reconciliation_claim_token')),
  'the execution ledger stores a short-lived reconciliation claim');

create temporary table w70_behavior_results(name text primary key, passed boolean not null) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_actions uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_exec_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_budget_id uuid := gen_random_uuid();
  v_budget public.mission_authority_budgets;
  v_reservation public.mission_authority_budget_reservations;
  v_execution public.agent_executions;
  v_claim public.agent_executions;
  v_done public.agent_executions;
  v_wrong_token uuid := gen_random_uuid();
  v_caught boolean;
  v_i integer;
  v_success_result jsonb := '{"summary":"Provider lookup confirmed the operation."}'::jsonb;
  v_success_evidence jsonb := '{"provider_receipt":{"id":"reconcile-receipt-1","charge_amount":3.5,"currency":"NOK"},"reconciliation":{"authoritative":true,"method":"provider_lookup","provider_state":"succeeded","result":"SUCCEEDED","checked_at":"2026-10-11T23:00:00Z"}}'::jsonb;
  v_failed_result jsonb := '{"reason":"Provider lookup confirmed no operation was created."}'::jsonb;
  v_failed_evidence jsonb := '{"provider_not_sent":true,"safe_to_retry":true,"reconciliation":{"authoritative":true,"method":"idempotency_key_lookup","provider_state":"not_found","result":"FAILED","checked_at":"2026-10-11T23:00:00Z"}}'::jsonb;
  v_overcap_evidence jsonb := '{"provider_receipt":{"id":"reconcile-receipt-3","charge_amount":12.5,"currency":"NOK"},"reconciliation":{"authoritative":true,"method":"receipt_lookup","provider_state":"succeeded","result":"SUCCEEDED","checked_at":"2026-10-11T23:00:00Z"}}'::jsonb;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name) values (v_workspace, v_owner, 'W70 durable reconciliation test');
  insert into public.workspace_members(workspace_id, user_id, role) values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Test durable UNKNOWN reconciliation', 'READY');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  insert into public.mission_actions(id, mission_id, title, position, status)
  select v_actions[s.idx], v_mission, 'W70 reconciliation action ' || s.idx, s.idx - 1, 'PENDING'
    from generate_subscripts(v_actions, 1) as s(idx);
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W70 reconciliation agent', 'Disposable reconciliation test', 'ACTIVE',
    '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb, v_owner);

  insert into public.mission_authority_budgets(
    id, workspace_id, mission_id, agent_id, authority_revision, authority_hash, status,
    not_before, expires_at, action_limit, actions_reserved, actions_consumed,
    max_spend, max_spend_per_action, spend_reserved, spend_consumed, currency, created_by
  ) values (
    v_budget_id, v_workspace, v_mission, v_agent, 1, repeat('a',64), 'ACTIVE',
    clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour',
    10, 3, 0, 30, 10, 30, 0, 'NOK', v_owner
  );

  for v_i in 1..3 loop
    insert into public.agent_executions(
      id, workspace_id, mission_id, action_id, agent_id, requested_by, idempotency_key,
      status, authority_snapshot, request, lease_expires_at, completed_at, reconciled_at,
      dispatch_claimed_at, dispatch_claim_authority_hash, dispatch_claim_request_hash, dispatch_claim_budget_revision
    ) values (
      v_exec_ids[v_i], v_workspace, v_mission, v_actions[v_i], v_agent, v_owner,
      'w70-reconcile-execution-key-' || v_i, 'UNKNOWN',
      '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb,
      jsonb_build_object('destination', 'https://provider.example.test/w70/' || v_i,
        'audience', 'provider.operation.v1', 'authority_budget_revision', '1'),
      clock_timestamp() - interval '1 minute', clock_timestamp() - interval '1 minute',
      clock_timestamp() - interval '30 seconds', clock_timestamp() - interval '2 minutes',
      repeat('a',64), repeat('b',64), 1
    );
    insert into public.mission_authority_budget_reservations(
      budget_id, execution_id, reserved_actions, reserved_spend, currency, status
    ) values (v_budget_id, v_exec_ids[v_i], 1, 10, 'NOK', 'HELD_UNKNOWN');
  end loop;

  v_caught := false;
  begin
    perform public.claim_agent_execution_reconciliation(v_exec_ids[1]);
  exception when sqlstate '42501' then
    if sqlerrm = 'TRUSTED_EXECUTOR_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w70_behavior_results values ('authenticated_claim_denied', v_caught);

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);

  select * into v_claim from public.claim_agent_execution_reconciliation(v_exec_ids[1]);
  insert into w70_behavior_results values ('first_claim_issues_token',
    v_claim.status = 'UNKNOWN' and v_claim.reconciliation_claim_token is not null
    and v_claim.reconciliation_lease_expires_at > clock_timestamp());

  v_caught := false;
  begin
    perform public.claim_agent_execution_reconciliation(v_exec_ids[1]);
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_RECONCILIATION_ALREADY_CLAIMED' then v_caught := true; else raise; end if;
  end;
  insert into w70_behavior_results values ('second_concurrent_claim_denied', v_caught);

  v_caught := false;
  begin
    perform public.reconcile_agent_execution_outcome(v_exec_ids[1], v_wrong_token, 'SUCCEEDED', v_success_result, v_success_evidence);
  exception when sqlstate '42501' then
    if sqlerrm = 'RECONCILIATION_CLAIM_TOKEN_INVALID_OR_EXPIRED' then v_caught := true; else raise; end if;
  end;
  insert into w70_behavior_results values ('wrong_token_denied', v_caught);

  select * into v_done from public.reconcile_agent_execution_outcome(
    v_exec_ids[1], v_claim.reconciliation_claim_token, 'SUCCEEDED', v_success_result, v_success_evidence);
  select * into v_reservation from public.mission_authority_budget_reservations where execution_id = v_exec_ids[1];
  select * into v_budget from public.mission_authority_budgets where id = v_budget_id;
  insert into w70_behavior_results values ('success_consumes_held_reservation',
    v_done.status = 'SUCCEEDED' and v_done.reconciled_at is not null
    and v_done.reconciliation_claim_token is null
    and v_done.evidence -> 'reconciliation' ->> 'method' = 'provider_lookup'
    and v_reservation.status = 'CONSUMED' and v_reservation.charged_spend = 3.5
    and v_budget.actions_reserved = 2 and v_budget.actions_consumed = 1
    and v_budget.spend_reserved = 20 and v_budget.spend_consumed = 3.5);

  select * into v_done from public.reconcile_agent_execution_outcome(
    v_exec_ids[1], v_claim.reconciliation_claim_token, 'SUCCEEDED', v_success_result, v_success_evidence);
  insert into w70_behavior_results values ('exact_success_replay_is_idempotent',
    v_done.status = 'SUCCEEDED' and v_done.evidence -> 'provider_receipt' ->> 'id' = 'reconcile-receipt-1');

  select * into v_claim from public.claim_agent_execution_reconciliation(v_exec_ids[2]);
  select * into v_done from public.reconcile_agent_execution_outcome(
    v_exec_ids[2], v_claim.reconciliation_claim_token, 'FAILED', v_failed_result, v_failed_evidence);
  select * into v_reservation from public.mission_authority_budget_reservations where execution_id = v_exec_ids[2];
  select * into v_budget from public.mission_authority_budgets where id = v_budget_id;
  insert into w70_behavior_results values ('confirmed_no_send_releases_budget',
    v_done.status = 'FAILED' and v_done.evidence -> 'provider_not_sent' = 'true'::jsonb
    and v_done.evidence -> 'safe_to_retry' = 'true'::jsonb
    and v_reservation.status = 'RELEASED' and v_budget.actions_reserved = 1
    and v_budget.actions_consumed = 1 and v_budget.spend_reserved = 10 and v_budget.spend_consumed = 3.5);

  select * into v_claim from public.claim_agent_execution_reconciliation(v_exec_ids[3]);
  v_caught := false;
  begin
    perform public.reconcile_agent_execution_outcome(
      v_exec_ids[3], v_claim.reconciliation_claim_token, 'SUCCEEDED',
      '{"summary":"Should not settle over budget."}'::jsonb, v_overcap_evidence);
  exception when sqlstate '22023' then
    if sqlerrm = 'PROVIDER_CHARGE_EXCEEDS_RESERVED_CAP' then v_caught := true; else raise; end if;
  end;
  select * into v_reservation from public.mission_authority_budget_reservations where execution_id = v_exec_ids[3];
  select * into v_execution from public.agent_executions where id = v_exec_ids[3];
  insert into w70_behavior_results values ('overcap_receipt_keeps_unknown_held',
    v_caught and v_execution.status = 'UNKNOWN' and v_reservation.status = 'HELD_UNKNOWN'
    and v_execution.reconciliation_claim_token = v_claim.reconciliation_claim_token);

  v_overcap_evidence := jsonb_set(v_overcap_evidence, '{provider_receipt,charge_amount}', '5'::jsonb);
  select * into v_done from public.reconcile_agent_execution_outcome(
    v_exec_ids[3], v_claim.reconciliation_claim_token, 'SUCCEEDED',
    '{"summary":"Provider lookup confirmed the operation."}'::jsonb, v_overcap_evidence);
  select * into v_budget from public.mission_authority_budgets where id = v_budget_id;
  insert into w70_behavior_results values ('valid_retry_after_rejected_settlement_succeeds',
    v_done.status = 'SUCCEEDED' and v_budget.actions_reserved = 0 and v_budget.actions_consumed = 2
    and v_budget.spend_reserved = 0 and v_budget.spend_consumed = 8.5);
end;
$behavior$;

select ok((select passed from w70_behavior_results where name = 'authenticated_claim_denied'),
  'authenticated users cannot claim an external outcome reconciliation');
select ok((select passed from w70_behavior_results where name = 'first_claim_issues_token'),
  'trusted worker receives a short-lived single-worker reconciliation token');
select ok((select passed from w70_behavior_results where name = 'second_concurrent_claim_denied'),
  'a second worker cannot claim while the reconciliation lease is active');
select ok((select passed from w70_behavior_results where name = 'wrong_token_denied'),
  'a different worker token cannot settle the claimed execution');
select ok((select passed from w70_behavior_results where name = 'success_consumes_held_reservation'),
  'authoritative provider success consumes held action/spend reservation exactly once');
select ok((select passed from w70_behavior_results where name = 'exact_success_replay_is_idempotent'),
  'a lost completion response can be replayed without settling budget twice');
select ok((select passed from w70_behavior_results where name = 'confirmed_no_send_releases_budget'),
  'authoritative no-send evidence releases held budget for explicit safe retry');
select ok((select passed from w70_behavior_results where name = 'overcap_receipt_keeps_unknown_held'),
  'over-cap provider charges leave the execution UNKNOWN and reservation held');
select ok((select passed from w70_behavior_results where name = 'valid_retry_after_rejected_settlement_succeeds'),
  'a corrected authoritative receipt settles the same attempt without a new provider dispatch');

select * from finish();
rollback;

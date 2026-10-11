-- W68: actual persistent authority-budget accounting on the execution ledger.
begin;
create extension if not exists pgtap;
select plan(21);

select ok(to_regclass('public.mission_authority_budgets') is not null,
  'persistent authority budget table exists');
select ok(to_regclass('public.mission_authority_budget_reservations') is not null,
  'execution-linked budget reservation table exists');
select ok(exists (
  select 1 from pg_indexes
   where schemaname = 'public'
     and indexname = 'mission_authority_budgets_one_active_scope_idx'
), 'one active budget revision is enforced per workspace/mission/agent');
select ok(not has_table_privilege('authenticated', 'public.mission_authority_budgets', 'INSERT'),
  'authenticated users cannot write budget rows directly');
select ok(not has_table_privilege('authenticated', 'public.mission_authority_budgets', 'UPDATE'),
  'authenticated users cannot directly alter budget limits or counters');
select ok(not has_table_privilege('authenticated', 'public.mission_authority_budget_reservations', 'SELECT'),
  'authenticated users cannot directly read private reservation records');
select ok(not has_table_privilege('service_role', 'public.mission_authority_budgets', 'INSERT'),
  'service_role cannot bypass budget configuration via direct table writes');
select ok(not has_table_privilege('service_role', 'public.mission_authority_budget_reservations', 'UPDATE'),
  'service_role cannot bypass settlement via direct reservation writes');
select ok(has_function_privilege('authenticated',
  'public.configure_mission_authority_budget(uuid,uuid,uuid,bigint,numeric,numeric,text,timestamp with time zone,timestamp with time zone)', 'EXECUTE'),
  'workspace editors can reach the guarded budget-configuration RPC');
select ok(has_function_privilege('authenticated',
  'public.revoke_mission_authority_budget(uuid)', 'EXECUTE'),
  'workspace editors can reach the guarded budget-revocation RPC');
select ok(lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))
  like '%authority_budget_revision%'
  and lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))
    like '%authority_budget_exhausted%'
  and lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))
    like '%for update%',
  'actual start RPC binds the budget revision and atomically reserves under a row lock');
select ok(lower(pg_get_functiondef('private.retry_agent_execution(uuid,text)'::regprocedure))
  like '%execution_budget_not_released_for_retry%'
  and lower(pg_get_functiondef('private.retry_agent_execution(uuid,text)'::regprocedure))
    like '%reserve_agent_execution_budget%',
  'side-effect retries need a released reservation and reserve budget again');
select ok(lower(pg_get_functiondef('private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%settle_agent_execution_budget%'
  and lower(pg_get_functiondef('private.settle_agent_execution_budget(uuid,text,jsonb)'::regprocedure))
    like '%provider_charge_exceeds_reserved_cap%',
  'trusted completion settles spend against the reserved cap');
select ok(not has_function_privilege('authenticated',
  'private.reserve_agent_execution_budget(uuid,uuid)', 'EXECUTE'),
  'authenticated clients cannot invoke the internal reservation helper');

create temporary table w68_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_action_a uuid := gen_random_uuid();
  v_action_b uuid := gen_random_uuid();
  v_action_c uuid := gen_random_uuid();
  v_action_d uuid := gen_random_uuid();
  v_budget jsonb;
  v_budget_id uuid;
  v_revision bigint;
  v_request_a jsonb;
  v_request_b jsonb;
  v_request_c jsonb;
  v_request_d jsonb;
  v_scope jsonb;
  v_approval public.mission_approvals;
  v_execution_a public.agent_executions;
  v_execution_b public.agent_executions;
  v_retry_b public.agent_executions;
  v_execution_c public.agent_executions;
  v_execution_d public.agent_executions;
  v_budget_row public.mission_authority_budgets;
  v_reservation public.mission_authority_budget_reservations;
  v_caught boolean;
begin
  insert into auth.users(id) values (v_owner), (v_other);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W68 authority-budget reservation test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner'), (v_workspace, v_other, 'member');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Test actual persistent action/spend budget', 'READY');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  insert into public.mission_actions(id, mission_id, title, position, status)
  values
    (v_action_a, v_mission, 'W68 success action', 0, 'PENDING'),
    (v_action_b, v_mission, 'W68 retryable action', 1, 'PENDING'),
    (v_action_c, v_mission, 'W68 unknown action', 2, 'PENDING'),
    (v_action_d, v_mission, 'W68 exhausted action', 3, 'PENDING');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (
    v_agent, v_workspace, 'W68 bounded side-effect agent',
    'Disposable persistent budget test', 'ACTIVE',
    '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb,
    v_owner
  );

  -- A workspace member may execute only within approved scope, but cannot
  -- mint or enlarge the authoritative action/spend budget.
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin
    perform public.configure_mission_authority_budget(
      v_workspace, v_mission, v_agent, 99, 999, 99, 'USD',
      clock_timestamp() + interval '1 hour',
      clock_timestamp() - interval '1 minute'
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'AUTHORITY_BUDGET_ADMIN_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w68_behavior_results values ('non_admin_budget_configuration_denied', v_caught);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_budget := public.configure_mission_authority_budget(
    v_workspace, v_mission, v_agent, 3, 30, 10, 'USD',
    clock_timestamp() + interval '1 hour',
    clock_timestamp() - interval '1 minute'
  );
  v_budget_id := (v_budget ->> 'id')::uuid;
  v_revision := (v_budget ->> 'authority_revision')::bigint;

  v_request_a := jsonb_build_object(
    'authority_budget_revision', v_revision,
    'destination', 'https://example.invalid/w68/action-a',
    'audience', 'w68-provider-v1',
    'summary', 'Perform the approved bounded action A',
    'payload', jsonb_build_object('operation', 'A', 'quantity', 1)
  );
  v_scope := jsonb_build_object(
    'schema_version', 1, 'type', 'agent_execution_binding_v1',
    'agent_id', v_agent, 'request', v_request_a
  );
  select * into v_approval from public.request_mission_approval(v_mission, v_action_a, v_scope);
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);
  select * into v_execution_a from public.start_agent_execution(
    v_mission, v_action_a, v_agent, 'w68-success-attempt-key-0001', v_request_a
  );
  select * into v_budget_row from public.mission_authority_budgets where id = v_budget_id;
  select * into v_reservation from public.mission_authority_budget_reservations
   where execution_id = v_execution_a.id;
  insert into w68_behavior_results values ('start_reserves_actual_ledger_budget',
    v_execution_a.status = 'RUNNING'
    and v_budget_row.actions_reserved = 1
    and v_budget_row.actions_consumed = 0
    and v_budget_row.spend_reserved = 10
    and v_budget_row.spend_consumed = 0
    and v_reservation.status = 'RESERVED');

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);
  select * into v_execution_a from public.complete_agent_execution(
    v_execution_a.id, 'SUCCEEDED', '{"outcome":"confirmed"}'::jsonb,
    '{"provider_receipt":{"id":"w68-receipt-a","charge_amount":3,"currency":"USD"}}'::jsonb,
    null, null
  );
  select * into v_budget_row from public.mission_authority_budgets where id = v_budget_id;
  select * into v_reservation from public.mission_authority_budget_reservations
   where execution_id = v_execution_a.id;
  insert into w68_behavior_results values ('success_settles_actual_charge',
    v_execution_a.status = 'SUCCEEDED'
    and v_budget_row.actions_reserved = 0
    and v_budget_row.actions_consumed = 1
    and v_budget_row.spend_reserved = 0
    and v_budget_row.spend_consumed = 3
    and v_reservation.status = 'CONSUMED'
    and v_reservation.charged_spend = 3);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_request_b := jsonb_build_object(
    'authority_budget_revision', v_revision,
    'destination', 'https://example.invalid/w68/action-b',
    'audience', 'w68-provider-v1',
    'summary', 'Perform the approved bounded action B',
    'payload', jsonb_build_object('operation', 'B', 'quantity', 1)
  );
  v_scope := jsonb_build_object(
    'schema_version', 1, 'type', 'agent_execution_binding_v1',
    'agent_id', v_agent, 'request', v_request_b
  );
  select * into v_approval from public.request_mission_approval(v_mission, v_action_b, v_scope);
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);
  select * into v_execution_b from public.start_agent_execution(
    v_mission, v_action_b, v_agent, 'w68-retryable-attempt-key-0001', v_request_b
  );

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);
  select * into v_execution_b from public.complete_agent_execution(
    v_execution_b.id, 'FAILED',
    '{"reason":"provider proved request was never sent"}'::jsonb,
    '{"outcome":"FAILED","provider_not_sent":true,"safe_to_retry":true}'::jsonb,
    'CONFIRMED_NOT_SENT', null
  );
  select * into v_budget_row from public.mission_authority_budgets where id = v_budget_id;
  select * into v_reservation from public.mission_authority_budget_reservations
   where execution_id = v_execution_b.id;
  insert into w68_behavior_results values ('proven_not_sent_releases_budget',
    v_execution_b.status = 'FAILED'
    and v_reservation.status = 'RELEASED'
    and v_budget_row.actions_reserved = 0
    and v_budget_row.actions_consumed = 1
    and v_budget_row.spend_reserved = 0
    and v_budget_row.spend_consumed = 3);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select * into v_retry_b from public.retry_agent_execution(
    v_execution_b.id, 'w68-retry-attempt-key-0001'
  );
  select * into v_budget_row from public.mission_authority_budgets where id = v_budget_id;
  select * into v_reservation from public.mission_authority_budget_reservations
   where execution_id = v_retry_b.id;
  insert into w68_behavior_results values ('retry_re_reserves_budget',
    v_retry_b.retry_of_execution_id = v_execution_b.id
    and v_reservation.status = 'RESERVED'
    and v_budget_row.actions_reserved = 1
    and v_budget_row.spend_reserved = 10);

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);
  select * into v_retry_b from public.complete_agent_execution(
    v_retry_b.id, 'SUCCEEDED', '{"outcome":"confirmed"}'::jsonb,
    '{"provider_receipt":{"id":"w68-receipt-b","charge_amount":2,"currency":"USD"}}'::jsonb,
    null, null
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_request_c := jsonb_build_object(
    'authority_budget_revision', v_revision,
    'destination', 'https://example.invalid/w68/action-c',
    'audience', 'w68-provider-v1',
    'summary', 'Perform the approved bounded action C',
    'payload', jsonb_build_object('operation', 'C', 'quantity', 1)
  );
  v_scope := jsonb_build_object(
    'schema_version', 1, 'type', 'agent_execution_binding_v1',
    'agent_id', v_agent, 'request', v_request_c
  );
  select * into v_approval from public.request_mission_approval(v_mission, v_action_c, v_scope);
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);
  select * into v_execution_c from public.start_agent_execution(
    v_mission, v_action_c, v_agent, 'w68-unknown-attempt-key-0001', v_request_c
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);
  select * into v_execution_c from public.complete_agent_execution(
    v_execution_c.id, 'FAILED', '{"reason":"provider failure did not prove no-send"}'::jsonb,
    '{"outcome":"FAILED","verified":false}'::jsonb, 'PROVIDER_FAILURE_UNCERTAIN', null
  );
  select * into v_budget_row from public.mission_authority_budgets where id = v_budget_id;
  select * into v_reservation from public.mission_authority_budget_reservations
   where execution_id = v_execution_c.id;
  insert into w68_behavior_results values ('unknown_keeps_budget_reserved',
    v_execution_c.status = 'UNKNOWN'
    and v_execution_c.evidence ->> 'outcome' = 'UNKNOWN'
    and v_execution_c.evidence -> 'reconciliation_required' = 'true'::jsonb
    and v_reservation.status = 'HELD_UNKNOWN'
    and v_budget_row.actions_reserved = 1
    and v_budget_row.actions_consumed = 2
    and v_budget_row.spend_reserved = 10
    and v_budget_row.spend_consumed = 5);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_request_d := jsonb_build_object(
    'authority_budget_revision', v_revision,
    'destination', 'https://example.invalid/w68/action-d',
    'audience', 'w68-provider-v1',
    'summary', 'Perform the approved bounded action D',
    'payload', jsonb_build_object('operation', 'D', 'quantity', 1)
  );
  v_scope := jsonb_build_object(
    'schema_version', 1, 'type', 'agent_execution_binding_v1',
    'agent_id', v_agent, 'request', v_request_d
  );
  select * into v_approval from public.request_mission_approval(v_mission, v_action_d, v_scope);
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);

  v_caught := false;
  begin
    select * into v_execution_d from public.start_agent_execution(
      v_mission, v_action_d, v_agent, 'w68-exhausted-attempt-key-0001', v_request_d
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'AUTHORITY_BUDGET_EXHAUSTED' then v_caught := true; else raise; end if;
  end;
  insert into w68_behavior_results values ('exhausted_budget_denies_new_start', v_caught);
end;
$behavior$;

select ok((select passed from w68_behavior_results where name = 'start_reserves_actual_ledger_budget'),
  'a side-effect start reserves one action and its per-action spend cap atomically');
select ok((select passed from w68_behavior_results where name = 'success_settles_actual_charge'),
  'trusted receipt settles reserved spend to the normalized provider charge');
select ok((select passed from w68_behavior_results where name = 'proven_not_sent_releases_budget'),
  'a definite no-send failure releases the reservation for safe retry');
select ok((select passed from w68_behavior_results where name = 'retry_re_reserves_budget'),
  'a safe retry creates a new attempt and reserves budget again');
select ok((select passed from w68_behavior_results where name = 'unknown_keeps_budget_reserved'),
  'UNKNOWN moves the reservation to HELD_UNKNOWN without freeing action/spend allowance');
select ok((select passed from w68_behavior_results where name = 'exhausted_budget_denies_new_start'),
  'action allowance cannot be exceeded by starting another side-effect attempt');
select ok((select passed from w68_behavior_results where name = 'non_admin_budget_configuration_denied'),
  'workspace members cannot mint or enlarge the authoritative budget');

select * from finish();
rollback;

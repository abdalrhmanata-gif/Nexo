-- W57: exact, expiring approval binding for agent executions and retries.
begin;
create extension if not exists pgtap;
select plan(20);

select ok(exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'mission_approvals' and column_name = 'expires_at'
), 'execution approvals have an explicit expiry');
select ok(exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'mission_approvals' and column_name = 'consumed_by_execution_id'
), 'an execution approval records the execution chain that consumed it');
select ok(to_regprocedure('private.agent_execution_approval_scope(uuid,uuid,integer,uuid,integer,uuid,jsonb,jsonb)') is not null,
  'canonical versioned approval-scope builder exists');
select ok(not has_function_privilege('authenticated',
  'private.agent_execution_approval_scope(uuid,uuid,integer,uuid,integer,uuid,jsonb,jsonb)', 'EXECUTE'),
  'authenticated users cannot call the internal scope builder directly');
select ok(lower(pg_get_functiondef('private.request_mission_approval(uuid,uuid,jsonb)'::regprocedure)) like '%agent_execution_binding_v1%',
  'approval requests store only the canonical execution-binding contract');
select ok(lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)) like '%requested_scope = v_expected_scope%',
  'a start requires an exact match to the current request binding');
select ok(lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)) like '%consumed_by_execution_id is null%',
  'a consumed approval cannot authorize an independent start');
select ok(lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)) like '%expires_at > clock_timestamp()%',
  'execution start rejects expired approvals');
select ok(lower(pg_get_functiondef('private.retry_agent_execution(uuid,text)'::regprocedure)) like '%requested_scope = v_expected_scope%',
  'retries re-check the exact current request binding');
select ok(lower(pg_get_functiondef('private.retry_agent_execution(uuid,text)'::regprocedure)) like '%consumed_by_execution_id in%',
  'a retry may reuse only an approval consumed by its own execution chain');
select ok(lower(pg_get_functiondef('private.decide_mission_approval(uuid,text,text)'::regprocedure)) like '%approval_expired%',
  'expired scoped approval requests cannot be approved');

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_action uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_approval public.mission_approvals;
  v_approval_b public.mission_approvals;
  v_approval_c public.mission_approvals;
  v_execution public.agent_executions;
  v_retry public.agent_executions;
  v_request jsonb;
  v_changed_request jsonb;
  v_wrong_destination jsonb;
  v_request_c jsonb;
  v_scope jsonb;
  v_scope_c jsonb;
  v_authority jsonb := '{"mode":"bounded","requires_approval":true,"external_side_effects":false}'::jsonb;
  v_caught boolean;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W57 exact approval binding test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Prove exact approval binding', 'READY');
  insert into public.mission_actions(id, mission_id, title, position, status)
  values (v_action, v_mission, 'W57 controlled action', 0, 'PENDING');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W57 test agent', 'Disposable approval binding agent', 'ACTIVE', v_authority, v_owner);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_request := jsonb_build_object(
    'destination', 'https://example.invalid/action',
    'audience', 'w57-disposable-test',
    'payload', jsonb_build_object('quantity', 1, 'note', 'approved value')
  );
  v_scope := jsonb_build_object(
    'schema_version', 1,
    'type', 'agent_execution_binding_v1',
    'agent_id', v_agent,
    'request', v_request
  );
  select * into v_approval from public.request_mission_approval(v_mission, v_action, v_scope);
  select * into v_approval from public.decide_mission_approval(v_approval.id, 'APPROVED', null);

  v_changed_request := v_request || jsonb_build_object('payload', jsonb_build_object('quantity', 2, 'note', 'changed value'));
  v_caught := false;
  begin
    perform public.start_agent_execution(v_mission, v_action, v_agent, 'w57-changed-input-key-0001', v_changed_request);
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then raise exception 'TEST_FAILED: changed request input reused the original approval'; end if;

  v_wrong_destination := v_request || jsonb_build_object('destination', 'https://other.invalid/action');
  v_caught := false;
  begin
    perform public.start_agent_execution(v_mission, v_action, v_agent, 'w57-wrong-destination-01', v_wrong_destination);
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then raise exception 'TEST_FAILED: changed destination reused the original approval'; end if;

  select * into v_execution
    from public.start_agent_execution(v_mission, v_action, v_agent, 'w57-valid-start-key-0001', v_request);
  if v_execution.approval_id is distinct from v_approval.id then
    raise exception 'TEST_FAILED: valid request did not record its exact approval';
  end if;
  if (select consumed_by_execution_id from public.mission_approvals where id = v_approval.id) is distinct from v_execution.id then
    raise exception 'TEST_FAILED: valid approval was not consumed by the created execution';
  end if;

  v_caught := false;
  begin
    perform public.start_agent_execution(v_mission, v_action, v_agent, 'w57-reuse-scope-key-0001', v_request);
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then raise exception 'TEST_FAILED: one approval authorized more than one independent execution'; end if;

  perform public.complete_agent_execution(v_execution.id, 'FAILED', null, null, 'TEST_FAILURE', 'Known disposable failure');
  select * into v_retry from public.retry_agent_execution(v_execution.id, 'w57-valid-retry-key-0001');
  if v_retry.retry_of_execution_id is distinct from v_execution.id
     or v_retry.approval_id is distinct from v_approval.id then
    raise exception 'TEST_FAILED: a valid exact approval could not authorize a same-chain retry';
  end if;

  -- A new scoped approval captures the current authority. Change the authority
  -- revision/content and prove the old approval no longer matches.
  select * into v_approval_b from public.request_mission_approval(v_mission, v_action, v_scope);
  select * into v_approval_b from public.decide_mission_approval(v_approval_b.id, 'APPROVED', null);
  update public.workspace_agents set authority = v_authority || '{"budget":"changed"}'::jsonb where id = v_agent;
  v_caught := false;
  begin
    perform public.start_agent_execution(v_mission, v_action, v_agent, 'w57-authority-change-key', v_request);
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then raise exception 'TEST_FAILED: approval survived an authority change'; end if;
  update public.workspace_agents set authority = v_authority where id = v_agent;

  update public.mission_approvals
     set expires_at = clock_timestamp() - interval '1 second'
   where id = v_approval_b.id;
  v_caught := false;
  begin
    perform public.start_agent_execution(v_mission, v_action, v_agent, 'w57-expired-start-key-01', v_request);
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then raise exception 'TEST_FAILED: an expired approval authorized a new execution'; end if;

  perform public.complete_agent_execution(v_retry.id, 'FAILED', null, null, 'TEST_FAILURE', 'Known disposable retry failure');
  update public.mission_approvals
     set expires_at = clock_timestamp() - interval '1 second'
   where id = v_approval.id;
  v_caught := false;
  begin
    perform public.retry_agent_execution(v_retry.id, 'w57-expired-retry-key-001');
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then raise exception 'TEST_FAILED: an expired approval authorized a retry'; end if;

  v_request_c := jsonb_build_object(
    'destination', 'https://example.invalid/cancelled',
    'audience', 'w57-disposable-test',
    'payload', jsonb_build_object('quantity', 3, 'note', 'cancelled scope')
  );
  v_scope_c := jsonb_build_object(
    'schema_version', 1,
    'type', 'agent_execution_binding_v1',
    'agent_id', v_agent,
    'request', v_request_c
  );
  select * into v_approval_c from public.request_mission_approval(v_mission, v_action, v_scope_c);
  select * into v_approval_c from public.decide_mission_approval(v_approval_c.id, 'CANCELLED', 'Cancelled before execution');
  v_caught := false;
  begin
    perform public.start_agent_execution(v_mission, v_action, v_agent, 'w57-cancelled-scope-key', v_request_c);
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then raise exception 'TEST_FAILED: a cancelled approval authorized execution'; end if;
end;
$behavior$;

select pass('changed request input cannot reuse an approval');
select pass('changed destination cannot reuse an approval');
select pass('valid exact approval is linked to a start and consumed once');
select pass('one approval cannot authorize a second independent start');
select pass('a live exact approval can authorize a retry in its existing execution chain');
select pass('a changed authority invalidates a previously requested approval');
select pass('an expired approval cannot authorize a new start');
select pass('an expired approval cannot authorize a retry');
select pass('a cancelled scoped approval cannot authorize execution');

select * from finish();
rollback;

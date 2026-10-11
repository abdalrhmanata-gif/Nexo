-- W63: a client cannot forge completion; trusted completion needs a real
-- provider receipt and must arrive before the execution lease expires.
begin;
create extension if not exists pgtap;
select plan(14);

select ok(to_regprocedure('public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)') is not null,
  'public completion wrapper exists');
select ok(not has_function_privilege('authenticated',
  'public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'authenticated clients cannot call the public completion wrapper');
select ok(not has_function_privilege('authenticated',
  'private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'authenticated clients cannot call the private completion implementation');
select ok(not has_function_privilege('anon',
  'public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'anonymous clients cannot complete executions');
select ok(has_function_privilege('service_role',
  'public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'trusted service role can call the public completion wrapper');
select ok(has_function_privilege('service_role',
  'private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'trusted service role can call the private completion implementation');
select ok(not has_function_privilege('authenticated',
  'private.agent_execution_has_meaningful_value(jsonb,integer)', 'EXECUTE'),
  'authenticated callers cannot invoke the receipt validator');
select ok(
  private.agent_execution_has_meaningful_value('{"provider":{"id":"receipt-1"}}'::jsonb, 0)
  and not private.agent_execution_has_meaningful_value('{"provider":{},"events":[]}'::jsonb, 0)
  and not private.agent_execution_has_meaningful_value('{"provider":{"id":"  "}}'::jsonb, 0),
  'receipt validator accepts meaningful nested evidence and rejects empty structures');
select ok(lower(pg_get_functiondef('private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%trusted_executor_required%',
  'completion implementation explicitly requires the trusted executor role');
select ok(lower(pg_get_functiondef('private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%provider_receipt_required%'
  and lower(pg_get_functiondef('private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%execution_lease_expired_requires_reconciliation%',
  'completion requires receipt evidence and rejects expired leases');

create temporary table w63_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_execution public.agent_executions;
  v_expired public.agent_executions;
  v_completed public.agent_executions;
  v_caught boolean;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W63 trusted completion test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Test trusted completion boundary', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W63 test agent', 'Disposable trusted completion test', 'ACTIVE',
    '{"mode":"read_only","requires_approval":false}'::jsonb, v_owner);

  insert into public.agent_executions(
    workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request
  ) values (
    v_workspace, v_mission, v_agent, v_owner, 'w63-valid-completion-key-0001',
    'RUNNING', '{}'::jsonb, '{"purpose":"trusted completion test"}'::jsonb
  ) returning * into v_execution;

  insert into public.agent_executions(
    workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, lease_expires_at
  ) values (
    v_workspace, v_mission, v_agent, v_owner, 'w63-expired-completion-key-0001',
    'RUNNING', '{}'::jsonb, '{"purpose":"expired completion test"}'::jsonb,
    clock_timestamp() - interval '1 second'
  ) returning * into v_expired;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_caught := false;
  begin
    perform public.complete_agent_execution(
      v_execution.id, 'SUCCEEDED', '{"outcome":"claimed"}'::jsonb,
      '{"provider_receipt":{"id":"client-forged-receipt"}}'::jsonb, null, null
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'TRUSTED_EXECUTOR_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w63_behavior_results values ('authenticated_completion_denied', v_caught);

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);

  v_caught := false;
  begin
    perform public.complete_agent_execution(
      v_execution.id, 'SUCCEEDED', '{"outcome":"claimed"}'::jsonb,
      '{"provider_receipt":{"metadata":{},"events":[]}}'::jsonb, null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'PROVIDER_RECEIPT_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w63_behavior_results values ('empty_receipt_denied', v_caught);

  select * into v_completed
    from public.complete_agent_execution(
      v_execution.id, 'SUCCEEDED', '{"outcome":"confirmed"}'::jsonb,
      '{"provider_receipt":{"id":"trusted-test-receipt-1"}}'::jsonb, null, null
    );
  insert into w63_behavior_results
    values ('valid_trusted_completion_succeeds',
      v_completed.status = 'SUCCEEDED'
      and v_completed.completed_at is not null
      and v_completed.evidence -> 'provider_receipt' ->> 'id' = 'trusted-test-receipt-1');

  v_caught := false;
  begin
    perform public.complete_agent_execution(
      v_expired.id, 'SUCCEEDED', '{"outcome":"late"}'::jsonb,
      '{"provider_receipt":{"id":"late-receipt"}}'::jsonb, null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' then v_caught := true; else raise; end if;
  end;
  insert into w63_behavior_results values ('expired_lease_completion_denied', v_caught);
end;
$behavior$;

select ok((select passed from w63_behavior_results where name = 'authenticated_completion_denied'),
  'authenticated user cannot forge a successful completion even with supplied evidence');
select ok((select passed from w63_behavior_results where name = 'empty_receipt_denied'),
  'trusted worker cannot mark success with empty or nested-empty receipt evidence');
select ok((select passed from w63_behavior_results where name = 'valid_trusted_completion_succeeds'),
  'trusted worker can complete an active execution with meaningful provider receipt');
select ok((select passed from w63_behavior_results where name = 'expired_lease_completion_denied'),
  'a late worker cannot finalize after lease expiry; reconciliation is required');

select * from finish();
rollback;

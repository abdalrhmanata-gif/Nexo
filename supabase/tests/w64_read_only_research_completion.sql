-- W64 historical scenarios run against W79's stricter trusted completion boundary.
begin;
create extension if not exists pgtap;
select plan(18);

select ok(to_regprocedure('public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null,
  'the old public completion signature is removed');
select ok(to_regprocedure('private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null,
  'the old private completion signature is removed');
select ok(to_regprocedure('public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)') is not null,
  'the requester-bound public completion wrapper exists');
select ok(to_regprocedure('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)') is not null,
  'the requester-bound private completion implementation exists');
select ok(not has_function_privilege('authenticated',
  'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'authenticated users cannot forge research completion');
select ok(not has_function_privilege('anon',
  'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'anonymous users cannot complete research executions');
select ok(has_function_privilege('service_role',
  'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'trusted server role can call the public completion wrapper');
select ok(not has_function_privilege('service_role',
  'private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'private completion implementation is not directly executable by service_role');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%trusted_executor_required%',
  'completion implementation explicitly requires the trusted executor role');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%requested_by <> p_requested_by%'
  and lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%external_side_effects%'
  and lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%research_result_must_remain_unverified%'
  and lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%execution_lease_expired_requires_reconciliation%',
  'requester, read-only authority, unverified result and lease invariants remain enforced');

create temporary table w64_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_research_agent uuid := gen_random_uuid();
  v_generic_agent uuid := gen_random_uuid();
  v_good public.agent_executions;
  v_other_user public.agent_executions;
  v_generic public.agent_executions;
  v_bad_verified public.agent_executions;
  v_bad_request public.agent_executions;
  v_expired public.agent_executions;
  v_result jsonb := '{"summary":"A bounded unverified research summary.","source_count":1}'::jsonb;
  v_evidence jsonb := '{"outcome":"SUCCEEDED","verified":false,"request_id":"w64-request-id-0001","sources":[{"title":"Example source","url":"https://example.com/"}]}'::jsonb;
  v_done public.agent_executions;
  v_caught boolean;
  v_claim jsonb;
begin
  insert into auth.users(id) values (v_owner), (v_other);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W64 read-only research completion test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner'), (v_workspace, v_other, 'member');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Test read-only research completion', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values
    (v_research_agent, v_workspace, 'W64 Research Agent', 'Bounded read-only research', 'ACTIVE',
      '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb, v_owner),
    (v_generic_agent, v_workspace, 'W64 Generic Agent', 'Not eligible for research completion', 'ACTIVE',
      '{"mode":"bounded","external_side_effects":true,"requires_approval":false}'::jsonb, v_owner);

  insert into public.agent_executions(
    workspace_id, mission_id, agent_id, requested_by, idempotency_key, status, authority_snapshot, request
  ) values
    (v_workspace, v_mission, v_research_agent, v_owner, 'w64-research-execution-key-0001', 'RUNNING',
      '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
      '{"type":"read_only_research","request_id":"w64-request-id-0001"}'::jsonb),
    (v_workspace, v_mission, v_research_agent, v_other, 'w64-other-execution-key-0001', 'RUNNING',
      '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
      '{"type":"read_only_research","request_id":"w64-request-id-0002"}'::jsonb),
    (v_workspace, v_mission, v_generic_agent, v_owner, 'w64-generic-execution-key-0001', 'RUNNING',
      '{"mode":"bounded","external_side_effects":true,"requires_approval":false}'::jsonb,
      '{"type":"external_action","request_id":"w64-generic-request-0001"}'::jsonb),
    (v_workspace, v_mission, v_research_agent, v_owner, 'w64-verified-execution-key-0001', 'RUNNING',
      '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
      '{"type":"read_only_research","request_id":"w64-request-id-verified"}'::jsonb),
    (v_workspace, v_mission, v_research_agent, v_owner, 'w64-mismatch-execution-key-0001', 'RUNNING',
      '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
      '{"type":"read_only_research","request_id":"w64-request-id-mismatch"}'::jsonb),
    (v_workspace, v_mission, v_research_agent, v_owner, 'w64-expired-execution-key-0001', 'RUNNING',
      '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
      '{"type":"read_only_research","request_id":"w64-request-id-expired"}'::jsonb);

  select * into v_good from public.agent_executions where idempotency_key='w64-research-execution-key-0001';
  select * into v_other_user from public.agent_executions where idempotency_key='w64-other-execution-key-0001';
  select * into v_generic from public.agent_executions where idempotency_key='w64-generic-execution-key-0001';
  select * into v_bad_verified from public.agent_executions where idempotency_key='w64-verified-execution-key-0001';
  select * into v_bad_request from public.agent_executions where idempotency_key='w64-mismatch-execution-key-0001';
  select * into v_expired from public.agent_executions where idempotency_key='w64-expired-execution-key-0001';
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_good.id, 'SUCCEEDED', v_result, v_evidence, null, null
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;
  insert into w64_behavior_results values ('authenticated_completion_denied', v_caught);

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);

  select public.claim_read_only_research_execution(v_owner, v_good.id, 'w64-request-id-0001')
    into v_claim;

  select * into v_done from public.complete_read_only_research_execution(
    v_owner, v_good.id, 'SUCCEEDED', v_result, v_evidence, null, null
  );
  insert into w64_behavior_results values ('valid_unverified_research',
    v_done.status = 'SUCCEEDED' and v_done.evidence -> 'verified' = 'false'::jsonb);

  select * into v_done from public.complete_read_only_research_execution(
    v_owner, v_good.id, 'SUCCEEDED', v_result, v_evidence, null, null
  );
  insert into w64_behavior_results values ('exact_replay_idempotent',
    v_done.status = 'SUCCEEDED' and v_done.id = v_good.id);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_generic.id, 'SUCCEEDED', v_result, v_evidence, null, null
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'RESEARCH_JIT_CLAIM_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w64_behavior_results values ('generic_agent_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_other_user.id, 'SUCCEEDED', v_result,
      '{"outcome":"SUCCEEDED","verified":false,"request_id":"w64-request-id-0002","sources":[{"title":"Example source","url":"https://example.com/"}]}'::jsonb,
      null, null
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' then v_caught := true; else raise; end if;
  end;
  insert into w64_behavior_results values ('wrong_requester_denied', v_caught);

  v_caught := false;
  begin
    perform public.claim_read_only_research_execution(v_owner, v_bad_verified.id, 'w64-request-id-verified');
    perform public.complete_read_only_research_execution(
      v_owner, v_bad_verified.id, 'SUCCEEDED', v_result,
      '{"outcome":"SUCCEEDED","verified":true,"request_id":"w64-request-id-verified","sources":[{"title":"Example source","url":"https://example.com/"}]}'::jsonb,
      null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_RESULT_MUST_REMAIN_UNVERIFIED' then v_caught := true; else raise; end if;
  end;
  insert into w64_behavior_results values ('verified_claim_denied', v_caught);

  v_caught := false;
  begin
    perform public.claim_read_only_research_execution(v_owner, v_bad_request.id, 'w64-request-id-mismatch');
    perform public.complete_read_only_research_execution(
      v_owner, v_bad_request.id, 'SUCCEEDED', v_result,
      '{"outcome":"SUCCEEDED","verified":false,"request_id":"different-request-id","sources":[{"title":"Example source","url":"https://example.com/"}]}'::jsonb,
      null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_RESULT_MUST_REMAIN_UNVERIFIED' then v_caught := true; else raise; end if;
  end;
  insert into w64_behavior_results values ('request_mismatch_denied', v_caught);

  v_caught := false;
  begin
    perform public.claim_read_only_research_execution(v_owner, v_expired.id, 'w64-request-id-expired');
    update public.agent_executions set lease_expires_at = clock_timestamp() - interval '1 second' where id = v_expired.id;
    perform public.complete_read_only_research_execution(
      v_owner, v_expired.id, 'SUCCEEDED', v_result,
      '{"outcome":"SUCCEEDED","verified":false,"request_id":"w64-request-id-expired","sources":[{"title":"Example source","url":"https://example.com/"}]}'::jsonb,
      null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' then v_caught := true; else raise; end if;
  end;
  insert into w64_behavior_results values ('expired_lease_denied', v_caught);
end;
$behavior$;

select ok((select passed from w64_behavior_results where name='authenticated_completion_denied'),
  'an authenticated client cannot write research completion directly');
select ok((select passed from w64_behavior_results where name='valid_unverified_research'),
  'the trusted server can record a bounded research result without claiming verification');
select ok((select passed from w64_behavior_results where name='exact_replay_idempotent'),
  'an exact completion replay returns the existing result without a second event');
select ok((select passed from w64_behavior_results where name='generic_agent_denied'),
  'generic agents and external-side-effect actions cannot use the research completion path');
select ok((select passed from w64_behavior_results where name='wrong_requester_denied'),
  'a workspace member cannot complete another user’s research execution');
select ok((select passed from w64_behavior_results where name='verified_claim_denied'),
  'research completion cannot claim independent verification');
select ok((select passed from w64_behavior_results where name='request_mismatch_denied'),
  'research evidence must match the exact request ID');
select ok((select passed from w64_behavior_results where name='expired_lease_denied'),
  'expired research leases must be reconciled rather than finalized');

select * from finish();
rollback;

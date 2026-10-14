-- W81: system-owned Mission Research still requires a one-time trusted JIT
-- claim that binds the exact requester, live Mission content and read-only Agent.
begin;
create extension if not exists pgtap;
select plan(21);

select ok(to_regprocedure('public.claim_read_only_research_execution(uuid,uuid,text)') is not null,
  'the trusted research JIT claim RPC exists');
select ok(to_regprocedure('private.claim_read_only_research_execution(uuid,uuid,text)') is not null,
  'the private research JIT claim implementation exists');
select ok(not has_function_privilege('authenticated',
  'public.claim_read_only_research_execution(uuid,uuid,text)', 'EXECUTE'),
  'authenticated clients cannot mint a system research claim');
select ok(not has_function_privilege('anon',
  'public.claim_read_only_research_execution(uuid,uuid,text)', 'EXECUTE'),
  'anonymous clients cannot mint a research claim');
select ok(has_function_privilege('service_role',
  'public.claim_read_only_research_execution(uuid,uuid,text)', 'EXECUTE'),
  'the trusted server can use the research claim wrapper');
select ok((select prosecdef from pg_proc where oid = 'private.claim_read_only_research_execution(uuid,uuid,text)'::regprocedure)
  and coalesce(array_to_string((select proconfig from pg_proc where oid = 'private.claim_read_only_research_execution(uuid,uuid,text)'::regprocedure), '|'), '')
    like '%search_path=pg_catalog, public, private, extensions%',
  'the private research claim pins its security-definer search path');
select ok(not (select prosecdef from pg_proc where oid = 'public.claim_read_only_research_execution(uuid,uuid,text)'::regprocedure),
  'the public claim wrapper stays SECURITY INVOKER and relies on its explicit service-role grant');
select ok(not has_function_privilege('service_role',
  'private.claim_read_only_research_execution(uuid,uuid,text)', 'EXECUTE'),
  'the service role cannot bypass the public guarded wrapper');
select ok((select prosecdef from pg_proc where oid = 'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure),
  'the public completion wrapper remains SECURITY DEFINER with its explicit trusted-role guard');
select ok((select count(*) = 4 from information_schema.columns
  where table_schema = 'public' and table_name = 'agent_executions'
    and column_name in ('research_claimed_at','research_claim_request_hash','research_claim_authority_hash','research_claim_mission_version')),
  'the execution ledger stores a complete claim tuple');
select ok(lower(pg_get_functiondef('private.claim_read_only_research_execution(uuid,uuid,text)'::regprocedure))
  like '%external_side_effects%' and lower(pg_get_functiondef('private.claim_read_only_research_execution(uuid,uuid,text)'::regprocedure))
  like '%for update%' and lower(pg_get_functiondef('private.claim_read_only_research_execution(uuid,uuid,text)'::regprocedure))
  like '%clock_timestamp()%',
  'the claim rechecks read-only authority under locks with a final database clock sample');
select ok(lower(pg_get_functiondef('public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%research_jit_claim_required%',
  'successful/uncertain trusted completion cannot bypass the research JIT claim');

create temporary table w81_behavior_results(name text primary key, passed boolean not null) on commit drop;
do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_execution uuid := gen_random_uuid();
  v_execution2 uuid;
  v_claim jsonb;
  v_caught boolean := false;
  v_request_id text := 'w81-research-request-0001';
begin
  insert into auth.users(id) values (v_owner), (v_attacker);
  insert into public.workspaces(id, owner_id, name) values (v_workspace, v_owner, 'W81 research JIT test');
  insert into public.workspace_members(workspace_id, user_id, role) values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Old objective', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W81 Research Agent', 'Read-only JIT test', 'ACTIVE',
    '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb, v_owner);
  insert into public.agent_executions(id, workspace_id, mission_id, agent_id, requested_by,
    idempotency_key, status, authority_snapshot, request)
  values (v_execution, v_workspace, v_mission, v_agent, v_owner,
    'w81-research-idempotency-key-0001', 'RUNNING',
    '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
    jsonb_build_object('type','read_only_research','request_id',v_request_id));

  -- A user-role JWT must not be enough to mint the trusted provider-send claim.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_owner,'role','authenticated')::text, true);
  begin
    perform public.claim_read_only_research_execution(v_owner, v_execution, v_request_id);
  exception when sqlstate '42501' then v_caught := true;
  end;
  insert into w81_behavior_results values ('authenticated_denied', v_caught);

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_owner,'role','service_role')::text, true);

  v_caught := false;
  begin
    perform public.claim_read_only_research_execution(v_attacker, v_execution, v_request_id);
  exception when sqlstate '42501' then v_caught := true;
  end;
  insert into w81_behavior_results values ('wrong_requester_denied', v_caught);

  v_caught := false;
  begin
    perform public.claim_read_only_research_execution(v_owner, v_execution, 'w81-different-request-id');
  exception when sqlstate '42501' then v_caught := true;
  end;
  insert into w81_behavior_results values ('request_id_mismatch_denied', v_caught);

  -- The provider receives the current locked DB snapshot, never the route's stale read.
  update public.missions set objective = 'Current approved research objective' where id = v_mission;
  select public.claim_read_only_research_execution(v_owner, v_execution, v_request_id) into v_claim;
  insert into w81_behavior_results values ('claim_binds_current_snapshot',
    v_claim ->> 'mission_objective' = 'Current approved research objective'
    and (v_claim ->> 'mission_version')::bigint = (select version from public.missions where id = v_mission)
    and (v_claim ->> 'request_id') = v_request_id
    and (v_claim ->> 'execution_id')::uuid = v_execution
    and (v_claim ->> 'authority_hash') ~ '^[0-9a-f]{64}$'
    and (v_claim ->> 'request_hash') ~ '^[0-9a-f]{64}$');

  v_caught := false;
  begin
    perform public.claim_read_only_research_execution(v_owner, v_execution, v_request_id);
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_EXECUTION_ALREADY_CLAIMED' then v_caught := true; else raise; end if;
  end;
  insert into w81_behavior_results values ('duplicate_claim_denied', v_caught);

  v_caught := false;
  begin
    update public.agent_executions set research_claim_request_hash = null where id = v_execution;
  exception when check_violation then v_caught := true;
  end;
  insert into w81_behavior_results values ('partial_claim_tuple_denied', v_caught);

  insert into public.agent_executions(workspace_id, mission_id, agent_id, requested_by,
    idempotency_key, status, authority_snapshot, request)
  values (v_workspace, v_mission, v_agent, v_owner,
    'w81-research-authority-change-0001', 'RUNNING',
    '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
    jsonb_build_object('type','read_only_research','request_id','w81-authority-change-0001'))
  returning id into v_execution2;
  update public.workspace_agents
     set authority = '{"mode":"read_only","external_side_effects":true,"requires_approval":true}'::jsonb
   where id = v_agent;
  v_caught := false;
  begin
    perform public.claim_read_only_research_execution(v_owner, v_execution2, 'w81-authority-change-0001');
  exception when sqlstate '42501' then
    if sqlerrm = 'RESEARCH_AGENT_AUTHORITY_CHANGED' then v_caught := true; else raise; end if;
  end;
  insert into w81_behavior_results values ('changed_authority_denied', v_caught);

  insert into public.agent_executions(workspace_id, mission_id, agent_id, requested_by,
    idempotency_key, status, authority_snapshot, request)
  values (v_workspace, v_mission, v_agent, v_owner,
    'w81-research-unclaimed-completion-0001', 'RUNNING',
    '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
    jsonb_build_object('type','read_only_research','request_id','w81-unclaimed-request-0001'))
  returning id into v_execution;
  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(v_owner, v_execution, 'SUCCEEDED',
      '{"summary":"forged","source_count":0}'::jsonb,
      '{"outcome":"SUCCEEDED","verified":false,"request_id":"w81-unclaimed-request-0001","sources":[]}'::jsonb,
      null, null);
  exception when sqlstate '42501' then
    if sqlerrm = 'RESEARCH_JIT_CLAIM_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w81_behavior_results values ('completion_without_claim_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(v_owner, v_execution, 'FAILED',
      '{"reason":"RESEARCH_JIT_CLAIM_DENIED"}'::jsonb,
      jsonb_build_object('outcome','FAILED','verified',false,'request_id','w81-unclaimed-request-0001', 'extra','forged'),
      'RESEARCH_JIT_CLAIM_DENIED', null);
  exception when sqlstate '42501' then v_caught := true;
  end;
  insert into w81_behavior_results values ('unclaimed_denial_reason_is_exact', v_caught);
end;
$behavior$;

select ok((select passed from w81_behavior_results where name = 'authenticated_denied'),
  'authenticated callers cannot mint research claims');
select ok((select passed from w81_behavior_results where name = 'wrong_requester_denied'),
  'trusted claims remain bound to the execution requester');
select ok((select passed from w81_behavior_results where name = 'request_id_mismatch_denied'),
  'trusted claims remain bound to the exact idempotency request');
select ok((select passed from w81_behavior_results where name = 'claim_binds_current_snapshot'),
  'claim payload uses the current mission version and content');
select ok((select passed from w81_behavior_results where name = 'duplicate_claim_denied'),
  'a research execution cannot be claimed twice');
select ok((select passed from w81_behavior_results where name = 'partial_claim_tuple_denied'),
  'claim hashes and version cannot be cleared independently after claim');
select ok((select passed from w81_behavior_results where name = 'changed_authority_denied'),
  'an authority change after execution start blocks the external research claim');
select ok((select passed from w81_behavior_results where name = 'completion_without_claim_denied'),
  'a successful research completion cannot be recorded before the provider boundary claim');
select ok((select passed from w81_behavior_results where name = 'unclaimed_denial_reason_is_exact'),
  'unclaimed failures can only close on the exact trusted pre-dispatch denial evidence');

select * from finish();
rollback;

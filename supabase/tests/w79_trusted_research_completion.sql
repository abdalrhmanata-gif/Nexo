-- W79: research completion cannot be forged by an authenticated end user.
begin;
create extension if not exists pgtap;
select plan(15);

select ok(to_regprocedure('private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null,
  'the old private user-callable completion signature is removed');
select ok(to_regprocedure('public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null,
  'the old public user-callable completion signature is removed');
select ok(to_regprocedure('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)') is not null,
  'the requester-bound private completion implementation exists');
select ok(to_regprocedure('public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)') is not null,
  'the requester-bound public completion wrapper exists');
select ok(not has_function_privilege('authenticated',
  'private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'authenticated callers cannot invoke the private completion implementation');
select ok(not has_function_privilege('authenticated',
  'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'authenticated callers cannot invoke the public completion wrapper');
select ok(not has_function_privilege('anon',
  'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'anonymous callers cannot complete research');
select ok(not has_function_privilege('service_role',
  'private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'trusted callers cannot invoke the private implementation directly');
select ok(has_function_privilege('service_role',
  'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'trusted server code can use the public PostgREST wrapper');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%trusted_executor_required%',
  'the completion implementation checks the trusted executor role');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%v_initial.requested_by <> p_requested_by%',
  'completion binds the supplied requester to the durable execution owner');
select ok((select prosecdef from pg_proc where oid = 'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure)
  and coalesce(array_to_string((select proconfig from pg_proc where oid = 'public.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure), '|'), '')
    like '%search_path=pg_catalog, public%',
  'the trusted public wrapper is SECURITY DEFINER with a pinned search_path');

create temporary table w79_results (
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
  v_completed public.agent_executions;
  v_caught boolean := false;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W79 trusted research completion test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Test trusted research completion', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W79 Research Agent', 'Disposable trusted completion test', 'ACTIVE',
    '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb, v_owner);
  insert into public.agent_executions(
    workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request
  ) values (
    v_workspace, v_mission, v_agent, v_owner, 'w79-research-completion-key-0001',
    'RUNNING', '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
    '{"type":"read_only_research","request_id":"w79-read-only-request-0001"}'::jsonb
  ) returning * into v_execution;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'SUCCEEDED',
      '{"summary":"Forged summary","source_count":0}'::jsonb,
      '{"outcome":"SUCCEEDED","request_id":"w79-read-only-request-0001","verified":false,"sources":[]}'::jsonb,
      null, null
    );
  exception when sqlstate '42501' then
    v_caught := true;
  end;
  insert into w79_results values ('authenticated_call_blocked', v_caught);

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      gen_random_uuid(), v_execution.id, 'SUCCEEDED',
      '{"summary":"Wrong requester","source_count":0}'::jsonb,
      '{"outcome":"SUCCEEDED","request_id":"w79-read-only-request-0001","verified":false,"sources":[]}'::jsonb,
      null, null
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' then
      v_caught := true;
    else
      raise;
    end if;
  end;
  insert into w79_results values ('wrong_requester_blocked', v_caught);

  select * into v_completed
    from public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'SUCCEEDED',
      '{"summary":"Trusted server result","source_count":0}'::jsonb,
      '{"outcome":"SUCCEEDED","request_id":"w79-read-only-request-0001","verified":false,"sources":[]}'::jsonb,
      null, null
    );
  insert into w79_results values ('trusted_completion_succeeds',
    v_completed.status = 'SUCCEEDED'
    and v_completed.requested_by = v_owner
    and v_completed.completed_at is not null
    and v_completed.evidence -> 'verified' = 'false'::jsonb);
end;
$behavior$;

select ok((select passed from w79_results where name = 'authenticated_call_blocked'),
  'authenticated users cannot fabricate research completion rows');
select ok((select passed from w79_results where name = 'wrong_requester_blocked'),
  'trusted server code cannot bind a completion to the wrong requester');
select ok((select passed from w79_results where name = 'trusted_completion_succeeds'),
  'trusted server completion succeeds for the actual requester and remains unverified');

select * from finish();
rollback;

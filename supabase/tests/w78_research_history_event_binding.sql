-- W78: a user cannot fabricate a RESEARCH_RUN_COMPLETED row unrelated to a durable read-only execution.
begin;
create extension if not exists pgtap;
select plan(16);

select ok(position('RESEARCH_RUN_COMPLETED' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'mission-event writer has a dedicated research-history policy');
select ok(position('RESEARCH_RUN_EXECUTION_BINDING_REQUIRED' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'history requires a well-formed execution and run id');
select ok(position('RESEARCH_RUN_EXECUTION_NOT_FOUND' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'history must bind to a requester-owned execution on the same mission');
select ok(position('v_execution.evidence -> ''sources'' is distinct from v_payload -> ''sources''' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'history citation payload must exactly match ledger evidence');
select ok(position('v_execution.result -> ''summary'' is distinct from v_payload -> ''summary''' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'history summary must exactly match the ledger result');
select ok(position('MISSION_EVENT_ALREADY_RECORDED' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'one completed read-only execution cannot create duplicate history rows');

select ok(
  position('private.workspace_role(v_workspace_id, auth.uid()) is null' in lower(pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure))) > 0,
  'recovery-history events reject a missing workspace role explicitly');

create temporary table w78_behavior_results (
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
  v_payload jsonb;
  v_caught boolean;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W78 research history binding test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Test research history authenticity', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W78 read-only agent', 'Disposable research history fixture', 'ACTIVE',
    '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb, v_owner);
  insert into public.agent_executions(
    workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, result, evidence, completed_at
  ) values (
    v_workspace, v_mission, v_agent, v_owner, 'w78-research-execution-key-0001',
    'SUCCEEDED', '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
    '{"type":"read_only_research","request_id":"w78-read-only-request-0001"}'::jsonb,
    '{"summary":"Bounded read-only research summary","source_count":1}'::jsonb,
    '{"outcome":"SUCCEEDED","verified":false,"request_id":"w78-read-only-request-0001","sources":[{"title":"Example source","url":"https://example.com/"}]}'::jsonb,
    clock_timestamp()
  ) returning * into v_execution;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_payload := jsonb_build_object(
    'schema_version', 1,
    'title', 'Read-only research completed',
    'execution', 'read_only_research',
    'status', 'COMPLETED',
    'run_id', gen_random_uuid()::text,
    'request_id', 'w78-read-only-request-0001',
    'summary', 'Bounded read-only research summary',
    'sources', '[{"title":"Example source","url":"https://example.com/"}]'::jsonb,
    'source_count', 1,
    'verified', false,
    'execution_id', v_execution.id::text
  );

  v_caught := false;
  begin
    perform public.record_mission_event(
      v_mission, 'RESEARCH_RUN_COMPLETED', v_payload - 'execution_id'
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_RUN_EXECUTION_BINDING_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w78_behavior_results values ('missing_execution_id_denied', v_caught);

  v_caught := false;
  begin
    perform public.record_mission_event(
      v_mission, 'RESEARCH_RUN_COMPLETED',
      v_payload || jsonb_build_object('summary', 'fabricated summary')
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_RUN_EVENT_INVALID' then v_caught := true; else raise; end if;
  end;
  insert into w78_behavior_results values ('fabricated_summary_denied', v_caught);

  v_caught := false;
  begin
    perform public.record_mission_event(
      v_mission, 'RESEARCH_RUN_COMPLETED',
      jsonb_set(v_payload, '{sources}',
        '[{"title":"Different citation","url":"https://attacker.example/"}]'::jsonb)
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_RUN_EVENT_INVALID' then v_caught := true; else raise; end if;
  end;
  insert into w78_behavior_results values ('fabricated_sources_denied', v_caught);

  v_caught := false;
  begin
    perform public.record_mission_event(
      v_mission, 'RESEARCH_RUN_COMPLETED',
      v_payload || jsonb_build_object('debug', 'extra field')
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_RUN_EVENT_INVALID' then v_caught := true; else raise; end if;
  end;
  insert into w78_behavior_results values ('extra_payload_field_denied', v_caught);

  v_caught := false;
  begin
    perform public.record_mission_event(
      v_mission, 'RESEARCH_RUN_COMPLETED',
      jsonb_set(v_payload, '{sources}',
        '[{"title":"Example source","url":"https://example.com/","raw_html":"extra"}]'::jsonb)
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_RUN_SOURCE_INVALID' then v_caught := true; else raise; end if;
  end;
  insert into w78_behavior_results values ('source_extra_field_denied', v_caught);

  v_caught := false;
  begin
    perform public.record_mission_event(
      v_mission, 'RESEARCH_RUN_COMPLETED',
      jsonb_set(v_payload, '{request_id}', '"w78-different-request-0001"'::jsonb)
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'RESEARCH_RUN_EVENT_INVALID' then v_caught := true; else raise; end if;
  end;
  insert into w78_behavior_results values ('wrong_request_id_denied', v_caught);

  v_caught := false;
  begin
    perform public.record_mission_event(
      v_mission, 'RESEARCH_RUN_COMPLETED',
      jsonb_set(v_payload, '{execution_id}', to_jsonb(gen_random_uuid()::text))
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'RESEARCH_RUN_EXECUTION_NOT_FOUND' then v_caught := true; else raise; end if;
  end;
  insert into w78_behavior_results values ('wrong_execution_denied', v_caught);

  perform public.record_mission_event(v_mission, 'RESEARCH_RUN_COMPLETED', v_payload);
  insert into w78_behavior_results values ('matching_ledger_event_accepted', exists (
    select 1 from public.mission_events
     where mission_id = v_mission
       and event_type = 'RESEARCH_RUN_COMPLETED'
       and payload ->> 'execution_id' = v_execution.id::text
       and payload ->> 'run_id' = v_payload ->> 'run_id'
  ));

  v_caught := false;
  begin
    perform public.record_mission_event(v_mission, 'RESEARCH_RUN_COMPLETED', v_payload);
  exception when sqlstate '22023' then
    if sqlerrm = 'MISSION_EVENT_ALREADY_RECORDED' then v_caught := true; else raise; end if;
  end;
  insert into w78_behavior_results values ('duplicate_execution_event_denied', v_caught);
end;
$behavior$;

select ok((select passed from w78_behavior_results where name = 'missing_execution_id_denied'),
  'a research history event cannot omit its execution binding');
select ok((select passed from w78_behavior_results where name = 'fabricated_summary_denied'),
  'a research history summary must match the durable result');
select ok((select passed from w78_behavior_results where name = 'fabricated_sources_denied'),
  'a history event cannot replace real citations with fabricated ones');
select ok((select passed from w78_behavior_results where name = 'extra_payload_field_denied'),
  'research history payload rejects extra top-level fields');
select ok((select passed from w78_behavior_results where name = 'source_extra_field_denied'),
  'citation records reject arbitrary fields');
select ok((select passed from w78_behavior_results where name = 'wrong_request_id_denied'),
  'history request id must match the ledger attempt');
select ok((select passed from w78_behavior_results where name = 'wrong_execution_denied'),
  'history event cannot bind to an execution from another id or mission');
select ok((select passed from w78_behavior_results where name = 'matching_ledger_event_accepted'),
  'a matching completed read-only research execution can be recorded');
select ok((select passed from w78_behavior_results where name = 'duplicate_execution_event_denied'),
  'a single execution can only produce one research history event');

select * from finish();
rollback;

-- W77: bounded read-only research payloads reject arbitrary or oversized JSON.
begin;
create extension if not exists pgtap;
select plan(18);

select ok(to_regprocedure('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)') is not null,
  'bounded read-only research completion implementation exists');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%octet_length(p_result::text) > 50000%'
  and lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%octet_length(p_evidence::text) > 98304%',
  'research result and evidence have explicit byte ceilings');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%result_key.key not in (''summary'', ''source_count'', ''reason'')%',
  'result JSON accepts only the documented top-level fields');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%evidence_key.key not in (''outcome'', ''verified'', ''request_id'', ''sources'')%',
  'evidence JSON accepts only the documented top-level fields');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%source_key.key not in (''title'', ''url'')%',
  'source entries accept only title and URL');
select ok(
  lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%https?://[^[:space:]/?#]+%'
  and lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%~ ''[[:space:]]''%',
  'source URLs must contain an HTTP(S) authority and no whitespace');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%char_length(v_error_code), 0) > 128%'
  and lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%char_length(v_error_message), 0) > 1000%',
  'stored provider error metadata is bounded');
select ok(lower(pg_get_functiondef('private.complete_read_only_research_execution(uuid,uuid,text,jsonb,jsonb,text,text)'::regprocedure))
  like '%jsonb_typeof(p_result -> ''summary'') is distinct from ''string''%',
  'summary must be a JSON string rather than an arbitrary serialized value');

create temporary table w77_behavior_results (
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
  v_done public.agent_executions;
  v_result jsonb := '{"summary":"Bounded unverified research summary.","source_count":1}'::jsonb;
  v_evidence jsonb := '{"outcome":"SUCCEEDED","verified":false,"request_id":"w77-request-id-0001","sources":[{"title":"Example source","url":"https://example.com/"}]}'::jsonb;
  v_failed_result jsonb := '{"reason":"UPSTREAM_REJECTED"}'::jsonb;
  v_failed_evidence jsonb := '{"outcome":"FAILED","verified":false,"request_id":"w77-request-id-0001"}'::jsonb;
  v_caught boolean;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W77 research payload bounds');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Test bounded research payloads', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W77 Research Agent', 'Disposable research payload test', 'ACTIVE',
    '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb, v_owner);
  insert into public.agent_executions(
    workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request
  ) values (
    v_workspace, v_mission, v_agent, v_owner, 'w77-research-execution-key-0001',
    'RUNNING', '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb,
    '{"type":"read_only_research","request_id":"w77-request-id-0001"}'::jsonb
  ) returning * into v_execution;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);

  perform public.claim_read_only_research_execution(v_owner, v_execution.id, 'w77-request-id-0001');

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'SUCCEEDED',
      v_result || '{"debug":"not an approved research field"}'::jsonb, v_evidence, null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'INVALID_RESEARCH_RESULT_SHAPE' then v_caught := true; else raise; end if;
  end;
  insert into w77_behavior_results values ('result_extra_field_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'SUCCEEDED',
      v_result,
      v_evidence || '{"provider_raw_response":"must not be stored"}'::jsonb, null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'INVALID_RESEARCH_EVIDENCE_SHAPE' then v_caught := true; else raise; end if;
  end;
  insert into w77_behavior_results values ('evidence_extra_field_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'SUCCEEDED',
      v_result,
      jsonb_set(v_evidence, '{sources}',
        '[{"title":"Example source","url":"https://example.com/","raw_html":"unbounded"}]'::jsonb),
      null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'INVALID_RESEARCH_SOURCE' then v_caught := true; else raise; end if;
  end;
  insert into w77_behavior_results values ('source_extra_field_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'SUCCEEDED',
      v_result,
      jsonb_set(v_evidence, '{sources}',
        '[{"title":"Malformed source","url":"https://"}]'::jsonb),
      null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'INVALID_RESEARCH_SOURCE' then v_caught := true; else raise; end if;
  end;
  insert into w77_behavior_results values ('malformed_url_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'SUCCEEDED',
      jsonb_build_object('summary', repeat('x', 50001), 'source_count', 1),
      v_evidence, null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'INVALID_RESEARCH_EXECUTION_PAYLOAD' then v_caught := true; else raise; end if;
  end;
  insert into w77_behavior_results values ('oversized_result_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'SUCCEEDED',
      v_result,
      jsonb_build_object('outcome', 'SUCCEEDED', 'verified', false,
        'request_id', 'w77-request-id-0001',
        'sources', jsonb_build_array(jsonb_build_object('title', repeat('x', 100000), 'url', 'https://example.com/'))),
      null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'INVALID_RESEARCH_EXECUTION_PAYLOAD' then v_caught := true; else raise; end if;
  end;
  insert into w77_behavior_results values ('oversized_evidence_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'FAILED',
      v_failed_result || '{"debug":"extra"}'::jsonb, v_failed_evidence, null, null
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'INVALID_RESEARCH_RESULT_SHAPE' then v_caught := true; else raise; end if;
  end;
  insert into w77_behavior_results values ('failure_result_extra_field_denied', v_caught);

  v_caught := false;
  begin
    perform public.complete_read_only_research_execution(
      v_owner, v_execution.id, 'FAILED', v_failed_result, v_failed_evidence, null, repeat('e', 1001)
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'INVALID_RESEARCH_EXECUTION_PAYLOAD' then v_caught := true; else raise; end if;
  end;
  insert into w77_behavior_results values ('oversized_error_message_denied', v_caught);

  select * into v_done from public.complete_read_only_research_execution(
    v_owner, v_execution.id, 'SUCCEEDED', v_result, v_evidence, null, null
  );
  insert into w77_behavior_results values ('valid_result_still_accepted',
    v_done.status = 'SUCCEEDED' and v_done.evidence -> 'verified' = 'false'::jsonb);

  select * into v_done from public.complete_read_only_research_execution(
    v_owner, v_execution.id, 'SUCCEEDED', v_result, v_evidence, null, null
  );
  insert into w77_behavior_results values ('exact_replay_still_idempotent',
    v_done.status = 'SUCCEEDED' and v_done.id = v_execution.id);
end;
$behavior$;

select ok((select passed from w77_behavior_results where name = 'result_extra_field_denied'),
  'research result rejects unapproved top-level fields');
select ok((select passed from w77_behavior_results where name = 'evidence_extra_field_denied'),
  'research evidence rejects unapproved top-level fields');
select ok((select passed from w77_behavior_results where name = 'source_extra_field_denied'),
  'research source records reject embedded HTML or arbitrary fields');
select ok((select passed from w77_behavior_results where name = 'malformed_url_denied'),
  'malformed citations without a host are denied');
select ok((select passed from w77_behavior_results where name = 'oversized_result_denied'),
  'oversized result JSON is rejected before persistence');
select ok((select passed from w77_behavior_results where name = 'oversized_evidence_denied'),
  'oversized evidence JSON is rejected before persistence');
select ok((select passed from w77_behavior_results where name = 'failure_result_extra_field_denied'),
  'failure and unknown records have the same narrow result allowlist');
select ok((select passed from w77_behavior_results where name = 'oversized_error_message_denied'),
  'error messages are bounded before persistence');
select ok((select passed from w77_behavior_results where name = 'valid_result_still_accepted'),
  'ordinary bounded read-only research remains supported');
select ok((select passed from w77_behavior_results where name = 'exact_replay_still_idempotent'),
  'exact research completion replay remains idempotent');

select * from finish();
rollback;

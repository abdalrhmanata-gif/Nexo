-- W77: cap and allowlist the authenticated read-only research completion payload.
-- A research result remains user-owned and unverified; it is not provider-side execution evidence.

create or replace function private.complete_read_only_research_execution(
  p_execution_id uuid,
  p_status text,
  p_result jsonb,
  p_evidence jsonb,
  p_error_code text default null,
  p_error_message text default null
) returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_execution public.agent_executions;
  v_initial public.agent_executions;
  v_agent public.workspace_agents;
  v_mission public.missions;
  v_now timestamptz;
  v_source_count integer;
  v_source jsonb;
  v_error_code text := nullif(btrim(coalesce(p_error_code, '')), '');
  v_error_message text := nullif(btrim(coalesce(p_error_message, '')), '');
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('SUCCEEDED', 'FAILED', 'UNKNOWN') then
    raise exception 'INVALID_RESEARCH_EXECUTION_STATUS' using errcode = '22023';
  end if;
  if p_result is null or jsonb_typeof(p_result) is distinct from 'object'
     or p_evidence is null or jsonb_typeof(p_evidence) is distinct from 'object' then
    raise exception 'INVALID_RESEARCH_EXECUTION_PAYLOAD' using errcode = '22023';
  end if;
  if octet_length(p_result::text) > 50000
     or octet_length(p_evidence::text) > 98304
     or coalesce(char_length(v_error_code), 0) > 128
     or coalesce(char_length(v_error_message), 0) > 1000 then
    raise exception 'INVALID_RESEARCH_EXECUTION_PAYLOAD' using errcode = '22023';
  end if;

  if exists (
       select 1 from jsonb_object_keys(p_result) as result_key(key)
        where result_key.key not in ('summary', 'source_count', 'reason')
     )
     or (
       p_status = 'SUCCEEDED'
       and (
         (select count(*) from jsonb_object_keys(p_result)) <> 2
         or not (p_result ? 'summary')
         or not (p_result ? 'source_count')
       )
     )
     or (
       p_status <> 'SUCCEEDED'
       and (
         (select count(*) from jsonb_object_keys(p_result)) <> 1
         or not (p_result ? 'reason')
         or jsonb_typeof(p_result -> 'reason') is distinct from 'string'
         or nullif(btrim(p_result ->> 'reason'), '') is null
         or char_length(p_result ->> 'reason') > 128
       )
     ) then
    raise exception 'INVALID_RESEARCH_RESULT_SHAPE' using errcode = '22023';
  end if;

  if exists (
       select 1 from jsonb_object_keys(p_evidence) as evidence_key(key)
        where evidence_key.key not in ('outcome', 'verified', 'request_id', 'sources')
     )
     or (
       p_status = 'SUCCEEDED'
       and (
         (select count(*) from jsonb_object_keys(p_evidence)) <> 4
         or not (p_evidence ? 'sources')
       )
     )
     or (
       p_status <> 'SUCCEEDED'
       and (
         (select count(*) from jsonb_object_keys(p_evidence)) <> 3
         or (p_evidence ? 'sources')
       )
     ) then
    raise exception 'INVALID_RESEARCH_EVIDENCE_SHAPE' using errcode = '22023';
  end if;

  -- Lock in mission -> agent -> execution order to match the start boundary.
  select * into v_initial
    from public.agent_executions
   where id = p_execution_id;
  if not found
     or v_initial.requested_by <> auth.uid()
     or not private.can_edit_workspace(v_initial.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_mission
    from public.missions
   where id = v_initial.mission_id
     and workspace_id = v_initial.workspace_id
   for update;
  if not found or v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = v_initial.agent_id
     and workspace_id = v_initial.workspace_id
   for share;
  if not found or v_agent.status <> 'ACTIVE' then
    raise exception 'RESEARCH_AGENT_AUTHORITY_CHANGED' using errcode = '42501';
  end if;

  if v_agent.authority ->> 'mode' is distinct from 'read_only'
     or v_agent.authority -> 'external_side_effects' is distinct from 'false'::jsonb then
    raise exception 'READ_ONLY_RESEARCH_EXECUTION_REQUIRED' using errcode = '42501';
  end if;

  if v_initial.authority_snapshot ->> 'mode' is distinct from 'read_only'
     or v_initial.authority_snapshot -> 'external_side_effects' is distinct from 'false'::jsonb then
    raise exception 'RESEARCH_AGENT_AUTHORITY_CHANGED' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;
  if not found
     or v_execution.requested_by <> auth.uid()
     or v_execution.workspace_id <> v_initial.workspace_id
     or v_execution.mission_id <> v_initial.mission_id
     or v_execution.agent_id <> v_initial.agent_id then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if v_execution.request ->> 'type' is distinct from 'read_only_research'
     or nullif(btrim(v_execution.request ->> 'request_id'), '') is null
     or char_length(v_execution.request ->> 'request_id') > 200
     or v_execution.action_id is not null then
    raise exception 'READ_ONLY_RESEARCH_EXECUTION_REQUIRED' using errcode = '42501';
  end if;

  if p_evidence -> 'verified' is distinct from 'false'::jsonb
     or p_evidence ->> 'request_id' is distinct from v_execution.request ->> 'request_id'
     or p_evidence ->> 'outcome' is distinct from p_status
     or nullif(btrim(p_evidence ->> 'request_id'), '') is null
     or char_length(p_evidence ->> 'request_id') > 200 then
    raise exception 'RESEARCH_RESULT_MUST_REMAIN_UNVERIFIED' using errcode = '22023';
  end if;

  if p_status = 'SUCCEEDED' then
    if jsonb_typeof(p_result -> 'summary') is distinct from 'string'
       or nullif(btrim(p_result ->> 'summary'), '') is null
       or char_length(p_result ->> 'summary') > 12000
       or jsonb_typeof(p_result -> 'source_count') is distinct from 'number'
       or (p_result ->> 'source_count')::numeric < 0
       or (p_result ->> 'source_count')::numeric > 12
       or trunc((p_result ->> 'source_count')::numeric) <> (p_result ->> 'source_count')::numeric
       or jsonb_typeof(p_evidence -> 'sources') is distinct from 'array' then
      raise exception 'INVALID_RESEARCH_RESULT_SHAPE' using errcode = '22023';
    end if;

    v_source_count := (p_result ->> 'source_count')::integer;
    if v_source_count < 0 or v_source_count > 12
       or jsonb_array_length(p_evidence -> 'sources') <> v_source_count then
      raise exception 'INVALID_RESEARCH_SOURCE_COUNT' using errcode = '22023';
    end if;

    for v_source in
      select value from jsonb_array_elements(p_evidence -> 'sources') as source(value)
    loop
      if jsonb_typeof(v_source) is distinct from 'object' then
        raise exception 'INVALID_RESEARCH_SOURCE' using errcode = '22023';
      end if;
      if (select count(*) from jsonb_object_keys(v_source)) <> 2
         or exists (
           select 1 from jsonb_object_keys(v_source) as source_key(key)
            where source_key.key not in ('title', 'url')
         )
         or jsonb_typeof(v_source -> 'url') is distinct from 'string'
         or (v_source ->> 'url') !~ '^https?://[^[:space:]/?#]+'
         or (v_source ->> 'url') ~ '[[:space:]]'
         or char_length(v_source ->> 'url') > 4096
         or jsonb_typeof(v_source -> 'title') is distinct from 'string'
         or nullif(btrim(v_source ->> 'title'), '') is null
         or char_length(v_source ->> 'title') > 500 then
        raise exception 'INVALID_RESEARCH_SOURCE' using errcode = '22023';
      end if;
    end loop;
  end if;

  if v_execution.status <> 'RUNNING' then
    if v_execution.status = p_status
       and v_execution.result is not distinct from p_result
       and v_execution.evidence is not distinct from p_evidence
       and v_execution.error_code is not distinct from v_error_code
       and v_execution.error_message is not distinct from v_error_message then
      return v_execution;
    end if;
    raise exception 'EXECUTION_ALREADY_FINALIZED' using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  if v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' using errcode = '22023';
  end if;

  update public.agent_executions
     set status = p_status,
         result = p_result,
         evidence = p_evidence,
         error_code = v_error_code,
         error_message = v_error_message,
         completed_at = v_now
   where id = v_execution.id
   returning * into v_execution;

  perform public.record_mission_event(
    v_execution.mission_id,
    'AGENT_EXECUTION_COMPLETED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'agent_id', v_execution.agent_id,
      'status', v_execution.status,
      'verified', false,
      'read_only_research', true,
      'request_id', v_execution.request ->> 'request_id'
    )
  );

  return v_execution;
end;
$function$;

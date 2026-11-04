-- W59: bind the approval expiry into the approved execution scope.
-- A privileged or accidental change to only the expiry column must not extend
-- the approval without also matching the expiry value recorded at request time.
create or replace function private.request_mission_approval(
  p_mission_id uuid,
  p_action_id uuid,
  p_scope jsonb
) returns public.mission_approvals
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_mission public.missions;
  v_action public.mission_actions;
  v_agent public.workspace_agents;
  v_approval public.mission_approvals;
  v_scope jsonb;
  v_request jsonb;
  v_agent_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_scope is null or jsonb_typeof(p_scope) <> 'object' then
    raise exception 'INVALID_APPROVAL_SCOPE' using errcode = '22023';
  end if;

  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or not private.can_edit_workspace(v_mission.workspace_id, auth.uid()) then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_action_id is not null then
    select * into v_action
      from public.mission_actions
     where id = p_action_id and mission_id = p_mission_id
     for share;
    if not found then
      raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  v_scope := p_scope;
  v_expires_at := null;

  if p_scope ->> 'type' = 'agent_execution_binding_v1' then
    if p_scope ->> 'schema_version' is distinct from '1'
       or (p_scope - array['schema_version', 'type', 'agent_id', 'request']) <> '{}'::jsonb
       or jsonb_typeof(p_scope -> 'request') is distinct from 'object' then
      raise exception 'INVALID_APPROVAL_SCOPE' using errcode = '22023';
    end if;

    begin
      v_agent_id := (p_scope ->> 'agent_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_APPROVAL_SCOPE' using errcode = '22023';
    end;

    select * into v_agent
      from public.workspace_agents
     where id = v_agent_id
       and workspace_id = v_mission.workspace_id
       and status = 'ACTIVE'
     for share;
    if not found then
      raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
    if coalesce((v_agent.authority ->> 'requires_approval')::boolean, false) is not true then
      raise exception 'APPROVAL_NOT_REQUIRED' using errcode = '22023';
    end if;

    v_request := p_scope -> 'request';
    v_scope := private.agent_execution_approval_scope(
      v_mission.workspace_id,
      v_mission.id,
      v_mission.version,
      p_action_id,
      case when p_action_id is null then null else v_action.version end,
      v_agent.id,
      v_agent.authority,
      v_request
    );
    -- Exact execution approvals expire after 24 hours. Generic collaboration
    -- approvals retain their existing semantics and do not authorize execution.
    v_expires_at := clock_timestamp() + interval '24 hours';
    v_scope := jsonb_set(v_scope, '{expires_at}', to_jsonb(v_expires_at), true);
  end if;

  if exists (
    select 1
      from public.mission_approvals
     where mission_id = p_mission_id
       and status = 'PENDING'
       and (expires_at is null or expires_at > clock_timestamp())
  ) then
    raise exception 'APPROVAL_ALREADY_PENDING' using errcode = '22023';
  end if;

  insert into public.mission_approvals(
    mission_id, workspace_id, action_id, requested_by, status, requested_scope, expires_at
  )
  values (
    v_mission.id, v_mission.workspace_id, p_action_id, auth.uid(), 'PENDING', v_scope, v_expires_at
  )
  returning * into v_approval;

  perform public.record_mission_event(
    v_mission.id,
    'APPROVAL_REQUESTED',
    jsonb_build_object(
      'approval_id', v_approval.id,
      'action_id', p_action_id,
      'requested_by', auth.uid(),
      'expires_at', v_approval.expires_at,
      'scope_type', v_scope ->> 'type',
      'scope_schema_version', v_scope -> 'schema_version'
    )
  );
  return v_approval;
end;
$function$;

create or replace function private.start_agent_execution(
  p_mission_id uuid,
  p_action_id uuid,
  p_agent_id uuid,
  p_idempotency_key text,
  p_request jsonb default '{}'::jsonb
) returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_action public.mission_actions;
  v_approval public.mission_approvals;
  v_execution public.agent_executions;
  v_requires_approval boolean;
  v_expected_scope jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) < 16 or char_length(p_idempotency_key) > 200 then
    raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'INVALID_EXECUTION_REQUEST' using errcode = '22023';
  end if;

  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or not private.can_edit_workspace(v_mission.workspace_id) then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = p_agent_id and workspace_id = v_mission.workspace_id and status = 'ACTIVE'
   for share;
  if not found then
    raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_action_id is not null then
    select * into v_action
      from public.mission_actions
     where id = p_action_id and mission_id = v_mission.id
     for update;
    if not found then
      raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  select * into v_execution
    from public.agent_executions
   where workspace_id = v_mission.workspace_id and idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_execution.mission_id <> v_mission.id
       or v_execution.agent_id <> v_agent.id
       or coalesce(v_execution.action_id, '00000000-0000-0000-0000-000000000000')
          <> coalesce(p_action_id, '00000000-0000-0000-0000-000000000000') then
      raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode = '22023';
    end if;
    -- Replays never imply permission to dispatch the existing attempt again.
    raise exception 'EXECUTION_ALREADY_EXISTS' using errcode = '22023';
  end if;

  v_requires_approval := coalesce((v_agent.authority ->> 'requires_approval')::boolean, false);
  if v_requires_approval then
    v_expected_scope := private.agent_execution_approval_scope(
      v_mission.workspace_id,
      v_mission.id,
      v_mission.version,
      p_action_id,
      case when p_action_id is null then null else v_action.version end,
      v_agent.id,
      v_agent.authority,
      p_request
    );

    select * into v_approval
      from public.mission_approvals
     where mission_id = v_mission.id
       and workspace_id = v_mission.workspace_id
       and action_id is not distinct from p_action_id
       and status = 'APPROVED'
       and decided_at is not null
       and expires_at > clock_timestamp()
       and consumed_by_execution_id is null
       and consumed_at is null
       and (requested_scope - 'expires_at') = v_expected_scope
       and (requested_scope ->> 'expires_at')::timestamptz = expires_at
     order by decided_at desc nulls last
     limit 1
     for update;

    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  insert into public.agent_executions(
    workspace_id, mission_id, action_id, agent_id, approval_id, requested_by,
    idempotency_key, status, authority_snapshot, request
  )
  values (
    v_mission.workspace_id, v_mission.id, p_action_id, v_agent.id,
    case when v_requires_approval then v_approval.id else null end,
    auth.uid(), p_idempotency_key, 'RUNNING', v_agent.authority, p_request
  )
  returning * into v_execution;

  if v_requires_approval then
    update public.mission_approvals
       set consumed_by_execution_id = v_execution.id,
           consumed_at = clock_timestamp()
     where id = v_approval.id
       and status = 'APPROVED'
       and consumed_by_execution_id is null
       and consumed_at is null
       and expires_at > clock_timestamp();
    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  perform public.record_mission_event(
    v_mission.id,
    'AGENT_EXECUTION_STARTED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'agent_id', v_agent.id,
      'action_id', p_action_id,
      'approval_id', v_execution.approval_id,
      'idempotency_key', p_idempotency_key
    )
  );
  return v_execution;
end;
$function$;

create or replace function private.retry_agent_execution(
  p_execution_id uuid,
  p_new_idempotency_key text
) returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_initial public.agent_executions;
  v_execution public.agent_executions;
  v_existing public.agent_executions;
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_action public.mission_actions;
  v_approval public.mission_approvals;
  v_requires_approval boolean;
  v_expected_scope jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_new_idempotency_key is null
     or char_length(btrim(p_new_idempotency_key)) < 16
     or char_length(p_new_idempotency_key) > 200 then
    raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  select * into v_initial from public.agent_executions where id = p_execution_id;
  if not found or not private.can_edit_workspace(v_initial.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_mission
    from public.missions
   where id = v_initial.mission_id
   for update;
  if not found or v_mission.workspace_id <> v_initial.workspace_id then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;
  if not found or not private.can_edit_workspace(v_execution.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_existing
    from public.agent_executions
   where workspace_id = v_execution.workspace_id
     and idempotency_key = btrim(p_new_idempotency_key)
   for update;
  if found then
    if v_existing.retry_of_execution_id = v_execution.id
       and v_existing.mission_id = v_execution.mission_id
       and v_existing.agent_id = v_execution.agent_id
       and v_existing.action_id is not distinct from v_execution.action_id then
      raise exception 'EXECUTION_ALREADY_EXISTS' using errcode = '22023';
    end if;
    raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.agent_executions e where e.retry_of_execution_id = v_execution.id
  ) then
    raise exception 'EXECUTION_RETRY_ALREADY_CREATED' using errcode = '22023';
  end if;
  if v_execution.status = 'UNKNOWN' then
    raise exception 'EXECUTION_OUTCOME_UNKNOWN_NOT_RETRYABLE' using errcode = '22023';
  end if;
  if v_execution.status not in ('FAILED', 'BLOCKED') then
    raise exception 'EXECUTION_STATUS_NOT_RETRYABLE' using errcode = '22023';
  end if;
  if v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = v_execution.agent_id
     and workspace_id = v_execution.workspace_id
     and status = 'ACTIVE'
   for share;
  if not found then
    raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.authority is distinct from v_execution.authority_snapshot then
    raise exception 'AGENT_AUTHORITY_CHANGED' using errcode = '22023';
  end if;

  if v_execution.action_id is not null then
    select * into v_action
      from public.mission_actions
     where id = v_execution.action_id and mission_id = v_execution.mission_id
     for share;
    if not found then
      raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  v_requires_approval := coalesce((v_agent.authority ->> 'requires_approval')::boolean, false);
  if v_requires_approval then
    v_expected_scope := private.agent_execution_approval_scope(
      v_mission.workspace_id,
      v_mission.id,
      v_mission.version,
      v_execution.action_id,
      case when v_execution.action_id is null then null else v_action.version end,
      v_agent.id,
      v_agent.authority,
      v_execution.request
    );

    select * into v_approval
      from public.mission_approvals a
     where a.id = v_execution.approval_id
       and a.mission_id = v_execution.mission_id
       and a.workspace_id = v_execution.workspace_id
       and a.action_id is not distinct from v_execution.action_id
       and a.status = 'APPROVED'
       and a.decided_at is not null
       and a.expires_at > clock_timestamp()
       and (a.requested_scope - 'expires_at') = v_expected_scope
       and (a.requested_scope ->> 'expires_at')::timestamptz = a.expires_at
       and a.consumed_by_execution_id in (
         with recursive execution_chain(id, retry_of_execution_id) as (
           select e.id, e.retry_of_execution_id
             from public.agent_executions e
            where e.id = v_execution.id
           union all
           select parent.id, parent.retry_of_execution_id
             from public.agent_executions parent
             join execution_chain child on child.retry_of_execution_id = parent.id
         )
         select id from execution_chain
       )
     for share;

    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  insert into public.agent_executions(
    workspace_id, mission_id, action_id, agent_id, approval_id, requested_by,
    idempotency_key, status, authority_snapshot, request, retry_of_execution_id, attempt_number
  )
  values (
    v_execution.workspace_id, v_execution.mission_id, v_execution.action_id,
    v_execution.agent_id, case when v_requires_approval then v_approval.id else null end,
    auth.uid(), btrim(p_new_idempotency_key), 'RUNNING', v_agent.authority,
    v_execution.request, v_execution.id, v_execution.attempt_number + 1
  )
  returning * into v_existing;

  perform public.record_mission_event(
    v_existing.mission_id,
    'AGENT_EXECUTION_RETRY_STARTED',
    jsonb_build_object(
      'execution_id', v_existing.id,
      'previous_execution_id', v_execution.id,
      'attempt_number', v_existing.attempt_number,
      'agent_id', v_existing.agent_id,
      'action_id', v_existing.action_id,
      'approval_id', v_existing.approval_id
    )
  );
  return v_existing;
end;
$function$;

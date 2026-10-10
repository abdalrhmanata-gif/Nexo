-- W57: exact, expiring, single-use approval bindings for agent execution.
-- Generic mission/action approvals remain available for review, but cannot authorize
-- an execution with a different request, agent, authority, version, destination, or audience.

create extension if not exists pgcrypto with schema extensions;

alter table public.mission_approvals
  add column if not exists expires_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_execution_id uuid;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mission_approvals'::regclass
      and conname = 'mission_approvals_consumed_execution_fkey'
  ) then
    alter table public.mission_approvals
      add constraint mission_approvals_consumed_execution_fkey
      foreign key (consumed_execution_id) references public.agent_executions(id) on delete set null;
  end if;
end;
$constraints$;

create index if not exists mission_approvals_execution_binding_idx
  on public.mission_approvals(mission_id, action_id, status, expires_at)
  where requested_scope ->> 'type' = 'agent_execution';

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
  v_request jsonb;
  v_expires_at timestamptz;
  v_authority_hash text;
  v_request_hash text;
  v_destination text;
  v_audience text;
  v_request_summary text;
  v_stored_scope jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_scope is null or jsonb_typeof(p_scope) <> 'object' then
    raise exception 'INVALID_APPROVAL_SCOPE' using errcode = '22023';
  end if;

  select * into v_mission
    from public.missions
   where id = p_mission_id
   for update;
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
  if exists (
    select 1 from public.mission_approvals
     where mission_id = p_mission_id and status = 'PENDING'
  ) then
    raise exception 'APPROVAL_ALREADY_PENDING' using errcode = '22023';
  end if;

  -- Legacy/human-review approvals are deliberately not execution grants.
  if p_scope ->> 'type' = 'agent_execution' then
    if p_scope ->> 'schema_version' is distinct from '1'
       or p_scope ->> 'mission_id' is distinct from v_mission.id::text
       or p_scope ->> 'action_id' is distinct from p_action_id::text
       or p_scope ->> 'mission_version' is distinct from v_mission.version::text
       or p_scope ->> 'action_version' is distinct from v_action.version::text then
      raise exception 'APPROVAL_BINDING_VERSION_MISMATCH' using errcode = '22023';
    end if;
    if p_scope ->> 'workspace_id' is not null
       and p_scope ->> 'workspace_id' is distinct from v_mission.workspace_id::text then
      raise exception 'APPROVAL_BINDING_WORKSPACE_MISMATCH' using errcode = '22023';
    end if;

    v_request := p_scope -> 'request';
    if v_request is null or jsonb_typeof(v_request) <> 'object' then
      raise exception 'INVALID_EXECUTION_APPROVAL_REQUEST' using errcode = '22023';
    end if;

    v_destination := nullif(btrim(p_scope ->> 'destination'), '');
    v_audience := nullif(btrim(p_scope ->> 'audience'), '');
    v_request_summary := nullif(btrim(p_scope ->> 'request_summary'), '');
    if v_destination is null or v_audience is null
       or v_request_summary is null or char_length(v_request_summary) > 500
       or v_request ->> 'destination' is distinct from v_destination
       or v_request ->> 'audience' is distinct from v_audience then
      raise exception 'INVALID_EXECUTION_APPROVAL_DESTINATION' using errcode = '22023';
    end if;

    begin
      v_expires_at := (p_scope ->> 'expires_at')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'INVALID_EXECUTION_APPROVAL_EXPIRY' using errcode = '22023';
    end;
    if v_expires_at is null
       or v_expires_at <= clock_timestamp()
       or v_expires_at > clock_timestamp() + interval '1 hour' then
      raise exception 'INVALID_EXECUTION_APPROVAL_EXPIRY' using errcode = '22023';
    end if;

    select * into v_agent
      from public.workspace_agents
     where id = nullif(p_scope ->> 'agent_id', '')::uuid
       and workspace_id = v_mission.workspace_id
       and status = 'ACTIVE'
     for share;
    if not found then
      raise exception 'APPROVAL_AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
    if not coalesce((v_agent.authority ->> 'requires_approval')::boolean, false) then
      raise exception 'APPROVAL_NOT_REQUIRED_BY_AGENT_POLICY' using errcode = '22023';
    end if;

    v_authority_hash := encode(extensions.digest(convert_to(v_agent.authority::text, 'UTF8'), 'sha256'), 'hex');
    v_request_hash := encode(extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'), 'hex');
    if p_scope ->> 'authority_hash' is not null
       and p_scope ->> 'authority_hash' is distinct from v_authority_hash then
      raise exception 'APPROVAL_BINDING_AUTHORITY_MISMATCH' using errcode = '22023';
    end if;
    if p_scope ->> 'request_hash' is not null
       and p_scope ->> 'request_hash' is distinct from v_request_hash then
      raise exception 'APPROVAL_BINDING_REQUEST_MISMATCH' using errcode = '22023';
    end if;

    v_stored_scope := jsonb_build_object(
      'type', 'agent_execution',
      'schema_version', 1,
      'workspace_id', v_mission.workspace_id,
      'mission_id', v_mission.id,
      'mission_version', v_mission.version,
      'action_id', p_action_id,
      'action_version', v_action.version,
      'agent_id', v_agent.id,
      'authority_hash', v_authority_hash,
      'request_hash', v_request_hash,
      'destination', v_destination,
      'audience', v_audience,
      'request_summary', v_request_summary,
      'expires_at', v_expires_at
    );
  else
    v_stored_scope := p_scope;
  end if;

  insert into public.mission_approvals(
    mission_id, workspace_id, action_id, requested_by, status, requested_scope, expires_at
  ) values (
    v_mission.id, v_mission.workspace_id, p_action_id, auth.uid(), 'PENDING',
    v_stored_scope, case when p_scope ->> 'type' = 'agent_execution' then v_expires_at else null end
  ) returning * into v_approval;

  perform public.record_mission_event(
    v_mission.id, 'APPROVAL_REQUESTED',
    jsonb_build_object('approval_id', v_approval.id, 'action_id', p_action_id, 'requested_by', auth.uid())
  );
  return v_approval;
end;
$function$;

create or replace function private.decide_mission_approval(
  p_approval_id uuid,
  p_decision text,
  p_note text default null
) returns public.mission_approvals
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_approval public.mission_approvals;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED', 'CANCELLED') then
    raise exception 'INVALID_APPROVAL_DECISION' using errcode = '22023';
  end if;

  select * into v_approval
    from public.mission_approvals
   where id = p_approval_id
   for update;
  if not found or private.workspace_role(v_approval.workspace_id) not in ('owner', 'admin') then
    raise exception 'APPROVAL_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_approval.status <> 'PENDING' then
    raise exception 'APPROVAL_ALREADY_DECIDED' using errcode = '22023';
  end if;
  if p_decision = 'APPROVED'
     and v_approval.expires_at is not null
     and v_approval.expires_at <= clock_timestamp() then
    raise exception 'APPROVAL_EXPIRED' using errcode = '22023';
  end if;

  update public.mission_approvals
     set status = p_decision,
         decided_by = auth.uid(),
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = clock_timestamp()
   where id = v_approval.id
   returning * into v_approval;

  perform public.record_mission_event(
    v_approval.mission_id, 'APPROVAL_DECIDED',
    jsonb_build_object('approval_id', v_approval.id, 'status', v_approval.status, 'decided_by', auth.uid())
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
  v_authority_hash text;
  v_request_hash text;
  v_destination text;
  v_audience text;
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

  select * into v_agent from public.workspace_agents
   where id = p_agent_id and workspace_id = v_mission.workspace_id and status = 'ACTIVE' for share;
  if not found then
    raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_action_id is not null then
    select * into v_action from public.mission_actions
     where id = p_action_id and mission_id = v_mission.id for update;
    if not found then
      raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  select * into v_execution from public.agent_executions
   where workspace_id = v_mission.workspace_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_execution.mission_id <> v_mission.id
       or v_execution.agent_id <> v_agent.id
       or coalesce(v_execution.action_id, '00000000-0000-0000-0000-000000000000')
          <> coalesce(p_action_id, '00000000-0000-0000-0000-000000000000')
       or v_execution.request is distinct from p_request then
      raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode = '22023';
    end if;
    -- Even an identical retry key cannot be used to dispatch a second time.
    raise exception 'EXECUTION_ALREADY_EXISTS' using errcode = '22023';
  end if;

  v_requires_approval := coalesce((v_agent.authority ->> 'requires_approval')::boolean, false);
  if v_requires_approval then
    v_destination := nullif(btrim(p_request ->> 'destination'), '');
    v_audience := nullif(btrim(p_request ->> 'audience'), '');
    if v_destination is null or v_audience is null then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
    v_authority_hash := encode(extensions.digest(convert_to(v_agent.authority::text, 'UTF8'), 'sha256'), 'hex');
    v_request_hash := encode(extensions.digest(convert_to(p_request::text, 'UTF8'), 'sha256'), 'hex');

    select * into v_approval
      from public.mission_approvals
     where mission_id = v_mission.id
       and workspace_id = v_mission.workspace_id
       and action_id is not distinct from p_action_id
       and status = 'APPROVED'
       and decided_at is not null
       and expires_at > clock_timestamp()
       and consumed_at is null
       and requested_scope ->> 'type' = 'agent_execution'
       and requested_scope ->> 'schema_version' = '1'
       and requested_scope ->> 'workspace_id' = v_mission.workspace_id::text
       and requested_scope ->> 'mission_id' = v_mission.id::text
       and requested_scope ->> 'mission_version' = v_mission.version::text
       and (requested_scope ->> 'action_id') is not distinct from p_action_id::text
       and (requested_scope ->> 'action_version') is not distinct from v_action.version::text
       and requested_scope ->> 'agent_id' = v_agent.id::text
       and requested_scope ->> 'authority_hash' = v_authority_hash
       and requested_scope ->> 'request_hash' = v_request_hash
       and requested_scope ->> 'destination' = v_destination
       and requested_scope ->> 'audience' = v_audience
       and (requested_scope ->> 'expires_at')::timestamptz = expires_at
       and (requested_scope ->> 'expires_at')::timestamptz > clock_timestamp()
     order by decided_at desc
     limit 1
     for update;
    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  insert into public.agent_executions(
    workspace_id, mission_id, action_id, agent_id, approval_id, requested_by,
    idempotency_key, status, authority_snapshot, request
  ) values (
    v_mission.workspace_id, v_mission.id, p_action_id, v_agent.id,
    case when v_requires_approval then v_approval.id else null end,
    auth.uid(), btrim(p_idempotency_key), 'RUNNING', v_agent.authority, p_request
  ) returning * into v_execution;

  if v_requires_approval then
    update public.mission_approvals
       set consumed_at = clock_timestamp(), consumed_execution_id = v_execution.id
     where id = v_approval.id and consumed_at is null;
    if not found then
      raise exception 'APPROVAL_ALREADY_CONSUMED' using errcode = '22023';
    end if;
  end if;

  perform public.record_mission_event(
    v_mission.id, 'AGENT_EXECUTION_STARTED',
    jsonb_build_object(
      'execution_id', v_execution.id, 'agent_id', v_agent.id, 'action_id', p_action_id,
      'approval_id', v_execution.approval_id, 'idempotency_key', p_idempotency_key
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
  v_authority_hash text;
  v_request_hash text;
  v_destination text;
  v_audience text;
  v_approval_in_lineage boolean := false;
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

  select * into v_mission from public.missions where id = v_initial.mission_id for update;
  if not found or v_mission.workspace_id <> v_initial.workspace_id then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_execution from public.agent_executions where id = p_execution_id for update;
  if not found or not private.can_edit_workspace(v_execution.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_existing from public.agent_executions
   where workspace_id = v_execution.workspace_id and idempotency_key = btrim(p_new_idempotency_key)
   for update;
  if found then
    if v_existing.retry_of_execution_id = v_execution.id
       and v_existing.mission_id = v_execution.mission_id
       and v_existing.agent_id = v_execution.agent_id
       and v_existing.action_id is not distinct from v_execution.action_id then
      return v_existing;
    end if;
    raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode = '22023';
  end if;

  if exists (select 1 from public.agent_executions e where e.retry_of_execution_id = v_execution.id) then
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

  select * into v_agent from public.workspace_agents
   where id = v_execution.agent_id and workspace_id = v_execution.workspace_id and status = 'ACTIVE'
   for share;
  if not found then
    raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.authority is distinct from v_execution.authority_snapshot then
    raise exception 'AGENT_AUTHORITY_CHANGED' using errcode = '22023';
  end if;

  if v_execution.action_id is not null then
    select * into v_action from public.mission_actions
     where id = v_execution.action_id and mission_id = v_mission.id for share;
    if not found then
      raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  v_requires_approval := coalesce((v_agent.authority ->> 'requires_approval')::boolean, false);
  if v_requires_approval then
    v_destination := nullif(btrim(v_execution.request ->> 'destination'), '');
    v_audience := nullif(btrim(v_execution.request ->> 'audience'), '');
    v_authority_hash := encode(extensions.digest(convert_to(v_agent.authority::text, 'UTF8'), 'sha256'), 'hex');
    v_request_hash := encode(extensions.digest(convert_to(v_execution.request::text, 'UTF8'), 'sha256'), 'hex');

    select * into v_approval from public.mission_approvals
     where id = v_execution.approval_id
       and mission_id = v_mission.id
       and workspace_id = v_mission.workspace_id
       and action_id is not distinct from v_execution.action_id
       and status = 'APPROVED'
       and decided_at is not null
       and expires_at > clock_timestamp()
       and consumed_at is not null
       and requested_scope ->> 'type' = 'agent_execution'
       and requested_scope ->> 'schema_version' = '1'
       and requested_scope ->> 'workspace_id' = v_mission.workspace_id::text
       and requested_scope ->> 'mission_id' = v_mission.id::text
       and requested_scope ->> 'mission_version' = v_mission.version::text
       and (requested_scope ->> 'action_id') is not distinct from v_execution.action_id::text
       and (requested_scope ->> 'action_version') is not distinct from v_action.version::text
       and requested_scope ->> 'agent_id' = v_agent.id::text
       and requested_scope ->> 'authority_hash' = v_authority_hash
       and requested_scope ->> 'request_hash' = v_request_hash
       and requested_scope ->> 'destination' = v_destination
       and requested_scope ->> 'audience' = v_audience
       and (requested_scope ->> 'expires_at')::timestamptz = expires_at
       and (requested_scope ->> 'expires_at')::timestamptz > clock_timestamp()
     for share;
    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;

    with recursive lineage(id, retry_of_execution_id) as (
      select e.id, e.retry_of_execution_id
        from public.agent_executions e
       where e.id = v_execution.id
      union all
      select parent.id, parent.retry_of_execution_id
        from public.agent_executions parent
        join lineage child on parent.id = child.retry_of_execution_id
    )
    select exists (
      select 1 from lineage where id = v_approval.consumed_execution_id
    ) into v_approval_in_lineage;
    if not v_approval_in_lineage then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  insert into public.agent_executions(
    workspace_id, mission_id, action_id, agent_id, approval_id, requested_by,
    idempotency_key, status, authority_snapshot, request, retry_of_execution_id, attempt_number
  ) values (
    v_execution.workspace_id, v_execution.mission_id, v_execution.action_id, v_execution.agent_id,
    case when v_requires_approval then v_approval.id else null end, auth.uid(),
    btrim(p_new_idempotency_key), 'RUNNING', v_agent.authority, v_execution.request,
    v_execution.id, v_execution.attempt_number + 1
  ) returning * into v_existing;

  perform public.record_mission_event(
    v_existing.mission_id, 'AGENT_EXECUTION_RETRY_STARTED',
    jsonb_build_object(
      'execution_id', v_existing.id, 'previous_execution_id', v_execution.id,
      'attempt_number', v_existing.attempt_number, 'agent_id', v_existing.agent_id,
      'action_id', v_existing.action_id, 'approval_id', v_existing.approval_id
    )
  );
  return v_existing;
end;
$function$;

revoke all on function private.request_mission_approval(uuid, uuid, jsonb),
  private.decide_mission_approval(uuid, text, text),
  private.start_agent_execution(uuid, uuid, uuid, text, jsonb),
  private.retry_agent_execution(uuid, text)
  from public, anon, authenticated;
grant execute on function private.request_mission_approval(uuid, uuid, jsonb),
  private.decide_mission_approval(uuid, text, text),
  private.start_agent_execution(uuid, uuid, uuid, text, jsonb),
  private.retry_agent_execution(uuid, text)
  to authenticated;

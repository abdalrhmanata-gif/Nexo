-- W49: explicit execution recovery controls.
-- UNKNOWN outcomes are never automatically retried. Cancellation is a request,
-- not proof that an external side effect stopped.

alter table public.agent_executions
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists retry_of_execution_id uuid,
  add column if not exists attempt_number integer,
  add column if not exists reconciled_at timestamptz;

update public.agent_executions
   set heartbeat_at = coalesce(heartbeat_at, created_at),
       lease_expires_at = coalesce(lease_expires_at, created_at + interval '5 minutes'),
       attempt_number = coalesce(attempt_number, 1);

alter table public.agent_executions
  alter column heartbeat_at set default now(),
  alter column heartbeat_at set not null,
  alter column lease_expires_at set default (now() + interval '5 minutes'),
  alter column lease_expires_at set not null,
  alter column attempt_number set default 1,
  alter column attempt_number set not null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_executions'::regclass
       and conname = 'agent_executions_attempt_number_positive'
  ) then
    alter table public.agent_executions
      add constraint agent_executions_attempt_number_positive check (attempt_number > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_executions'::regclass
       and conname = 'agent_executions_retry_of_fkey'
  ) then
    alter table public.agent_executions
      add constraint agent_executions_retry_of_fkey
      foreign key (retry_of_execution_id) references public.agent_executions(id) on delete set null;
  end if;
end;
$constraints$;

create index if not exists agent_executions_workspace_status_lease_idx
  on public.agent_executions(workspace_id, status, lease_expires_at);
create index if not exists agent_executions_retry_of_idx
  on public.agent_executions(retry_of_execution_id)
  where retry_of_execution_id is not null;

-- Execution state is mutated only through the audited RPC boundary.
revoke insert, update on public.agent_executions from anon, authenticated;
grant select on public.agent_executions to authenticated;

create or replace function private.heartbeat_agent_execution(p_execution_id uuid)
returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_execution public.agent_executions;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;

  if not found or not private.can_edit_workspace(v_execution.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_execution.status <> 'RUNNING' then
    raise exception 'EXECUTION_NOT_RUNNING' using errcode = '22023';
  end if;

  update public.agent_executions
     set heartbeat_at = now(),
         lease_expires_at = now() + interval '5 minutes'
   where id = v_execution.id
   returning * into v_execution;

  return v_execution;
end;
$function$;

create or replace function private.request_agent_execution_cancellation(p_execution_id uuid)
returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_execution public.agent_executions;
  v_new_request boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;

  if not found or not private.can_edit_workspace(v_execution.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_execution.status <> 'RUNNING' then
    raise exception 'EXECUTION_NOT_RUNNING' using errcode = '22023';
  end if;

  if v_execution.cancel_requested_at is null then
    update public.agent_executions
       set cancel_requested_at = now()
     where id = v_execution.id
     returning * into v_execution;
    v_new_request := true;
  end if;

  if v_new_request then
    perform public.record_mission_event(
      v_execution.mission_id,
      'AGENT_EXECUTION_CANCEL_REQUESTED',
      jsonb_build_object(
        'execution_id', v_execution.id,
        'status', v_execution.status,
        'cancel_requested_at', v_execution.cancel_requested_at
      )
    );
  end if;

  return v_execution;
end;
$function$;

create or replace function private.reconcile_stale_agent_execution(p_execution_id uuid)
returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_execution public.agent_executions;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;

  if not found or private.workspace_role(v_execution.workspace_id) not in ('owner', 'admin') then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_execution.status <> 'RUNNING' then
    raise exception 'EXECUTION_NOT_RUNNING' using errcode = '22023';
  end if;
  if v_execution.lease_expires_at > v_now then
    raise exception 'EXECUTION_LEASE_NOT_EXPIRED' using errcode = '22023';
  end if;

  update public.agent_executions
     set status = 'UNKNOWN',
         error_code = 'EXECUTION_LEASE_EXPIRED',
         error_message = 'No confirmed completion arrived before the execution lease expired.',
         evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
           'outcome', 'unknown',
           'safe_to_retry', false,
           'reconciliation_reason', 'lease_expired',
           'cancel_requested', cancel_requested_at is not null,
           'reconciled_at', v_now
         ),
         reconciled_at = v_now,
         completed_at = v_now
   where id = v_execution.id
   returning * into v_execution;

  perform public.record_mission_event(
    v_execution.mission_id,
    'AGENT_EXECUTION_RECONCILED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'status', 'UNKNOWN',
      'error_code', 'EXECUTION_LEASE_EXPIRED',
      'safe_to_retry', false,
      'reconciled_at', v_now
    )
  );

  return v_execution;
end;
$function$;

create or replace function private.retry_agent_execution(
  p_execution_id uuid,
  p_new_idempotency_key text
)
returns public.agent_executions
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
  v_approval public.mission_approvals;
  v_requires_approval boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_new_idempotency_key is null
     or char_length(btrim(p_new_idempotency_key)) < 16
     or char_length(p_new_idempotency_key) > 200 then
    raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  -- Read the parent to find its mission, then lock in mission -> execution
  -- order, matching start_agent_execution and reducing deadlock risk.
  select * into v_initial
    from public.agent_executions
   where id = p_execution_id;
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
      return v_existing;
    end if;
    raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.agent_executions e
     where e.retry_of_execution_id = v_execution.id
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

  v_requires_approval := coalesce((v_agent.authority ->> 'requires_approval')::boolean, false);
  if v_requires_approval then
    select * into v_approval
      from public.mission_approvals
     where id = v_execution.approval_id
       and mission_id = v_execution.mission_id
       and action_id is not distinct from v_execution.action_id
       and status = 'APPROVED'
     for share;
    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  insert into public.agent_executions (
    workspace_id, mission_id, action_id, agent_id, approval_id,
    requested_by, idempotency_key, status, authority_snapshot, request,
    retry_of_execution_id, attempt_number
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

create or replace function public.heartbeat_agent_execution(p_execution_id uuid)
returns public.agent_executions
language sql
set search_path = pg_catalog, public
as $$ select private.heartbeat_agent_execution(p_execution_id); $$;

create or replace function public.request_agent_execution_cancellation(p_execution_id uuid)
returns public.agent_executions
language sql
set search_path = pg_catalog, public
as $$ select private.request_agent_execution_cancellation(p_execution_id); $$;

create or replace function public.reconcile_stale_agent_execution(p_execution_id uuid)
returns public.agent_executions
language sql
set search_path = pg_catalog, public
as $$ select private.reconcile_stale_agent_execution(p_execution_id); $$;

create or replace function public.retry_agent_execution(p_execution_id uuid, p_new_idempotency_key text)
returns public.agent_executions
language sql
set search_path = pg_catalog, public
as $$ select private.retry_agent_execution(p_execution_id, p_new_idempotency_key); $$;

revoke all on function public.heartbeat_agent_execution(uuid),
  public.request_agent_execution_cancellation(uuid),
  public.reconcile_stale_agent_execution(uuid),
  public.retry_agent_execution(uuid,text) from public, anon;
grant execute on function public.heartbeat_agent_execution(uuid),
  public.request_agent_execution_cancellation(uuid),
  public.reconcile_stale_agent_execution(uuid),
  public.retry_agent_execution(uuid,text) to authenticated;

revoke all on function private.heartbeat_agent_execution(uuid),
  private.request_agent_execution_cancellation(uuid),
  private.reconcile_stale_agent_execution(uuid),
  private.retry_agent_execution(uuid,text) from public, anon, authenticated;
grant execute on function private.heartbeat_agent_execution(uuid),
  private.request_agent_execution_cancellation(uuid),
  private.reconcile_stale_agent_execution(uuid),
  private.retry_agent_execution(uuid,text) to authenticated;

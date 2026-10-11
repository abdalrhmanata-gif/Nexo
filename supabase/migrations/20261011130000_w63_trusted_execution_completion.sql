-- W63: only the trusted server executor may finalize an execution.
-- Authenticated workspace editors may start and request recovery, but must not
-- forge SUCCEEDED/FAILED/UNKNOWN by calling the completion RPC directly.
-- A successful completion requires meaningful provider receipt evidence, and a
-- worker may not finalize after its lease expires; late results must reconcile.

create or replace function private.agent_execution_has_meaningful_value(
  p_value jsonb,
  p_depth integer default 0
) returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_type text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return false;
  end if;

  v_type := jsonb_typeof(p_value);
  if v_type = 'string' then
    return nullif(btrim(p_value #>> '{}'), '') is not null;
  elsif v_type in ('number', 'boolean') then
    return true;
  elsif v_type in ('object', 'array') then
    if greatest(coalesce(p_depth, 0), 0) >= 8 then
      return false;
    end if;

    if v_type = 'object' then
      return exists (
        select 1
          from jsonb_each(p_value) as item(key, value)
         where private.agent_execution_has_meaningful_value(item.value, greatest(coalesce(p_depth, 0), 0) + 1)
      );
    end if;

    return exists (
      select 1
        from jsonb_array_elements(p_value) as item(value)
       where private.agent_execution_has_meaningful_value(item.value, greatest(coalesce(p_depth, 0), 0) + 1)
    );
  end if;

  return false;
end;
$function$;

revoke all on function private.agent_execution_has_meaningful_value(jsonb, integer)
  from public, anon, authenticated;

create or replace function private.complete_agent_execution(
  p_execution_id uuid,
  p_status text,
  p_result jsonb default null,
  p_evidence jsonb default null,
  p_error_code text default null,
  p_error_message text default null
) returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_execution public.agent_executions;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;

  if p_status not in ('SUCCEEDED', 'FAILED', 'UNKNOWN', 'BLOCKED') then
    raise exception 'INVALID_EXECUTION_STATUS' using errcode = '22023';
  end if;
  if p_result is not null and jsonb_typeof(p_result) <> 'object' then
    raise exception 'INVALID_EXECUTION_RESULT' using errcode = '22023';
  end if;
  if p_evidence is not null and jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'INVALID_EXECUTION_EVIDENCE' using errcode = '22023';
  end if;
  if p_status = 'SUCCEEDED'
     and (
       p_evidence is null
       or not (p_evidence ? 'provider_receipt')
       or not private.agent_execution_has_meaningful_value(p_evidence -> 'provider_receipt', 0)
     ) then
    raise exception 'PROVIDER_RECEIPT_REQUIRED' using errcode = '22023';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;

  if not found then
    raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_execution.status <> 'RUNNING' then
    return v_execution;
  end if;

  -- Sample time after the row lock. Once the lease has expired, a late worker
  -- cannot convert an uncertain outcome into a final result.
  v_now := clock_timestamp();
  if v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' using errcode = '22023';
  end if;

  update public.agent_executions
     set status = p_status,
         result = p_result,
         evidence = p_evidence,
         error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
         error_message = nullif(btrim(coalesce(p_error_message, '')), ''),
         completed_at = v_now
   where id = v_execution.id
   returning * into v_execution;

  perform public.record_mission_event(
    v_execution.mission_id,
    'AGENT_EXECUTION_COMPLETED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'agent_id', v_execution.agent_id,
      'action_id', v_execution.action_id,
      'status', v_execution.status,
      'approval_id', v_execution.approval_id
    )
  );

  return v_execution;
end;
$function$;

revoke all on function public.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  to service_role;

revoke all on function private.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function private.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  to service_role;

-- W50: an expired execution lease cannot be renewed by a late worker.
-- Once the lease expires, the execution must be reconciled; an unknown external
-- outcome is never made retryable by a heartbeat.
create or replace function private.heartbeat_agent_execution(p_execution_id uuid)
returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_execution public.agent_executions;
  v_now timestamptz;
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

  -- Sample wall-clock time only after acquiring the row lock. now() would
  -- remain fixed at transaction start and could revive a lease that expired
  -- while this statement waited for another worker/reconciler.
  v_now := clock_timestamp();
  if v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED' using errcode = '22023';
  end if;

  update public.agent_executions
     set heartbeat_at = v_now,
         lease_expires_at = v_now + interval '5 minutes'
   where id = v_execution.id
   returning * into v_execution;

  return v_execution;
end;
$function$;

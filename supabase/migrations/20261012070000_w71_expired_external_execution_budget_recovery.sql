-- W71: stale external executions retain their persistent budget reservation.
-- W49 previously marked an expired RUNNING execution UNKNOWN without moving its
-- RESERVED W68 budget row to HELD_UNKNOWN. W70 reconciliation correctly refuses
-- to settle an UNKNOWN attempt unless the reservation is held, which could leave
-- crashed workers permanently stuck. Preserve the budget counters and hold the
-- reservation before exposing a stale external execution to W70 reconciliation.

create or replace function private.reconcile_stale_agent_execution(
  p_execution_id uuid
) returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_initial public.agent_executions;
  v_execution public.agent_executions;
  v_mission public.missions;
  v_reservation public.mission_authority_budget_reservations;
  v_budget public.mission_authority_budgets;
  v_is_external_side_effect boolean := false;
  v_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  -- Use the same mission -> execution -> reservation -> budget lock ordering
  -- as W69 dispatch and W70 reconciliation to avoid lock-order inversions.
  select * into v_initial
    from public.agent_executions
   where id = p_execution_id;
  if not found
     or private.workspace_role(v_initial.workspace_id) not in ('owner', 'admin') then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_mission
    from public.missions
   where id = v_initial.mission_id
     and workspace_id = v_initial.workspace_id
   for update;
  if not found then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;
  if not found
     or v_execution.mission_id <> v_initial.mission_id
     or v_execution.workspace_id <> v_initial.workspace_id
     or private.workspace_role(v_execution.workspace_id) not in ('owner', 'admin') then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_execution.status <> 'RUNNING' then
    raise exception 'EXECUTION_NOT_RUNNING' using errcode = '22023';
  end if;

  -- Sample wall-clock time after the execution lock; transaction-start now()
  -- could otherwise revive a lease that expired during a lock wait.
  v_now := clock_timestamp();
  if v_execution.lease_expires_at > v_now then
    raise exception 'EXECUTION_LEASE_NOT_EXPIRED' using errcode = '22023';
  end if;

  v_is_external_side_effect :=
    coalesce(v_execution.authority_snapshot -> 'external_side_effects' = 'true'::jsonb, false);

  if v_is_external_side_effect then
    select * into v_reservation
      from public.mission_authority_budget_reservations
     where execution_id = v_execution.id
     for update;
    if not found or v_reservation.status not in ('RESERVED', 'HELD_UNKNOWN') then
      raise exception 'EXECUTION_BUDGET_RESERVATION_NOT_OPEN' using errcode = '22023';
    end if;

    select * into v_budget
      from public.mission_authority_budgets
     where id = v_reservation.budget_id
       and workspace_id = v_execution.workspace_id
       and mission_id = v_execution.mission_id
       and agent_id = v_execution.agent_id
     for update;
    if not found
       or v_budget.actions_reserved < v_reservation.reserved_actions
       or v_budget.spend_reserved < v_reservation.reserved_spend then
      raise exception 'AUTHORITY_BUDGET_ACCOUNTING_MISMATCH' using errcode = '22023';
    end if;

    if v_reservation.status = 'RESERVED' then
      update public.mission_authority_budget_reservations
         set status = 'HELD_UNKNOWN',
             settlement_reason = 'EXECUTION_LEASE_EXPIRED_OUTCOME_UNKNOWN',
             settled_at = null
       where id = v_reservation.id
       returning * into v_reservation;
    end if;
  end if;

  update public.agent_executions
     set status = 'UNKNOWN',
         error_code = 'EXECUTION_LEASE_EXPIRED',
         error_message = 'No confirmed completion arrived before the execution lease expired.',
         evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
           'outcome', 'unknown',
           'safe_to_retry', false,
           'reconciliation_required', v_is_external_side_effect,
           'reconciliation_reason', 'lease_expired',
           'budget_reservation_status', case when v_is_external_side_effect then 'HELD_UNKNOWN' else null end,
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
      'reconciliation_required', v_is_external_side_effect,
      'budget_reservation_id', case when v_is_external_side_effect then v_reservation.id else null end,
      'budget_reservation_status', case when v_is_external_side_effect then 'HELD_UNKNOWN' else null end,
      'reconciled_at', v_now
    )
  );

  return v_execution;
end;
$function$;

revoke all on function private.reconcile_stale_agent_execution(uuid)
  from public, anon, service_role;
grant execute on function private.reconcile_stale_agent_execution(uuid)
  to authenticated;

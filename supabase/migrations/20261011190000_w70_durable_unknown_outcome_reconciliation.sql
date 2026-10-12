-- W70: durable, leased reconciliation for UNKNOWN external executions.
-- Provider lookups run outside these database transactions; only trusted workers
-- can claim reconciliation or settle the existing HELD_UNKNOWN budget.

alter table public.agent_executions
  add column if not exists reconciliation_claimed_at timestamptz,
  add column if not exists reconciliation_lease_expires_at timestamptz,
  add column if not exists reconciliation_claim_token uuid;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_executions'::regclass
       and conname = 'agent_executions_reconciliation_claim_consistency'
  ) then
    alter table public.agent_executions
      add constraint agent_executions_reconciliation_claim_consistency
      check (
        (reconciliation_claimed_at is null and reconciliation_lease_expires_at is null and reconciliation_claim_token is null)
        or
        (reconciliation_claimed_at is not null and reconciliation_lease_expires_at is not null
          and reconciliation_claim_token is not null and reconciliation_claimed_at < reconciliation_lease_expires_at)
      );
  end if;
end;
$constraints$;

create index if not exists agent_executions_reconciliation_lease_idx
  on public.agent_executions(reconciliation_lease_expires_at)
  where reconciliation_claim_token is not null;

create or replace function private.claim_agent_execution_reconciliation(p_execution_id uuid)
returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_initial public.agent_executions;
  v_execution public.agent_executions;
  v_mission public.missions;
  v_reservation public.mission_authority_budget_reservations;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;

  select * into v_initial from public.agent_executions where id = p_execution_id;
  if not found then raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_mission from public.missions
   where id = v_initial.mission_id and workspace_id = v_initial.workspace_id for update;
  if not found then raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_execution from public.agent_executions where id = p_execution_id for update;
  if not found or v_execution.mission_id <> v_initial.mission_id
     or v_execution.workspace_id <> v_initial.workspace_id then
    raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_execution.status in ('SUCCEEDED', 'FAILED') and v_execution.reconciled_at is not null
     and coalesce(v_execution.evidence, '{}'::jsonb) ? 'reconciliation' then
    return v_execution; -- terminal replay: inspect only, never dispatch or lookup again
  end if;
  if v_execution.status <> 'UNKNOWN'
     or v_execution.authority_snapshot -> 'external_side_effects' is distinct from 'true'::jsonb
     or v_execution.action_id is null then
    raise exception 'EXECUTION_NOT_RECONCILABLE' using errcode = '22023';
  end if;

  select * into v_reservation from public.mission_authority_budget_reservations
   where execution_id = v_execution.id for update;
  if not found or v_reservation.status <> 'HELD_UNKNOWN' then
    raise exception 'EXECUTION_BUDGET_RESERVATION_NOT_HELD_UNKNOWN' using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  if v_execution.reconciliation_claim_token is not null
     and v_execution.reconciliation_lease_expires_at > v_now then
    raise exception 'EXECUTION_RECONCILIATION_ALREADY_CLAIMED' using errcode = '22023';
  end if;

  update public.agent_executions
     set reconciliation_claimed_at = v_now,
         reconciliation_lease_expires_at = v_now + interval '5 minutes',
         reconciliation_claim_token = gen_random_uuid()
   where id = v_execution.id
   returning * into v_execution;

  perform public.record_mission_event(
    v_execution.mission_id,
    'AGENT_EXECUTION_RECONCILIATION_CLAIMED',
    jsonb_build_object('execution_id', v_execution.id,
      'lease_expires_at', v_execution.reconciliation_lease_expires_at)
  );
  return v_execution;
end;
$function$;

create or replace function public.claim_agent_execution_reconciliation(p_execution_id uuid)
returns public.agent_executions
language sql
set search_path = pg_catalog, public
as $function$
  select private.claim_agent_execution_reconciliation(p_execution_id);
$function$;

revoke all on function private.claim_agent_execution_reconciliation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.claim_agent_execution_reconciliation(uuid) to service_role;
revoke all on function public.claim_agent_execution_reconciliation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_agent_execution_reconciliation(uuid) to service_role;

create or replace function private.reconcile_agent_execution_outcome(
  p_execution_id uuid,
  p_claim_token uuid,
  p_status text,
  p_result jsonb,
  p_evidence jsonb
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
  v_reconciliation jsonb;
  v_receipt jsonb;
  v_charge_json jsonb;
  v_charge numeric(20,6) := 0;
  v_checked_at timestamptz;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('SUCCEEDED', 'FAILED') then
    raise exception 'INVALID_RECONCILIATION_STATUS' using errcode = '22023';
  end if;
  if p_result is null or jsonb_typeof(p_result) is distinct from 'object'
     or p_evidence is null or jsonb_typeof(p_evidence) is distinct from 'object'
     or octet_length(p_result::text) > 12000 or octet_length(p_evidence::text) > 24000 then
    raise exception 'INVALID_RECONCILIATION_PAYLOAD' using errcode = '22023';
  end if;

  v_reconciliation := p_evidence -> 'reconciliation';
  if jsonb_typeof(v_reconciliation) is distinct from 'object'
     or v_reconciliation -> 'authoritative' is distinct from 'true'::jsonb
     or v_reconciliation ->> 'result' is distinct from p_status
     or nullif(btrim(v_reconciliation ->> 'provider_state'), '') is null
     or char_length(v_reconciliation ->> 'provider_state') > 100
     or coalesce(v_reconciliation ->> 'method', '') not in
       ('provider_lookup', 'idempotency_key_lookup', 'receipt_lookup', 'provider_webhook') then
    raise exception 'AUTHORITATIVE_RECONCILIATION_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;
  begin
    v_checked_at := (v_reconciliation ->> 'checked_at')::timestamptz;
  exception when others then
    raise exception 'INVALID_RECONCILIATION_CHECKED_AT' using errcode = '22023';
  end;
  if v_checked_at is null then
    raise exception 'INVALID_RECONCILIATION_CHECKED_AT' using errcode = '22023';
  end if;

  v_receipt := p_evidence -> 'provider_receipt';
  if p_status = 'SUCCEEDED' then
    if p_evidence -> 'provider_not_sent' = 'true'::jsonb
       or jsonb_typeof(v_receipt) is distinct from 'object'
       or not private.agent_execution_has_meaningful_value(v_receipt, 0) then
      raise exception 'PROVIDER_SUCCESS_RECEIPT_REQUIRED' using errcode = '22023';
    end if;
  elsif p_evidence -> 'provider_not_sent' is distinct from 'true'::jsonb
     or p_evidence -> 'safe_to_retry' is distinct from 'true'::jsonb then
    raise exception 'PROVIDER_NOT_SENT_PROOF_REQUIRED' using errcode = '22023';
  end if;
  if p_evidence -> 'verified' = 'true'::jsonb then
    raise exception 'RECONCILED_OUTCOME_IS_NOT_INDEPENDENT_VERIFICATION' using errcode = '22023';
  end if;

  select * into v_initial from public.agent_executions where id = p_execution_id;
  if not found then raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_mission from public.missions
   where id = v_initial.mission_id and workspace_id = v_initial.workspace_id for update;
  if not found then raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_execution from public.agent_executions where id = p_execution_id for update;
  if not found or v_execution.mission_id <> v_initial.mission_id
     or v_execution.workspace_id <> v_initial.workspace_id then
    raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Exact replay is safe after the token has been cleared by a committed result.
  if v_execution.status = p_status and v_execution.reconciled_at is not null
     and v_execution.evidence -> 'reconciliation' is not distinct from v_reconciliation
     and (not (p_evidence ? 'provider_receipt')
       or v_execution.evidence -> 'provider_receipt' is not distinct from v_receipt)
     and (not (p_evidence ? 'provider_not_sent')
       or v_execution.evidence -> 'provider_not_sent' is not distinct from p_evidence -> 'provider_not_sent')
     and v_execution.evidence -> 'safe_to_retry' is not distinct from to_jsonb(p_status = 'FAILED')
     and v_execution.result is not distinct from p_result then
    return v_execution;
  end if;
  if v_execution.status <> 'UNKNOWN' then
    raise exception 'EXECUTION_ALREADY_RECONCILED' using errcode = '22023';
  end if;

  -- Reject cached or delayed evidence that predates the actual dispatch attempt.
  -- Legacy attempts without a W69 claim must still be newer than the execution row.
  if v_checked_at <= coalesce(v_execution.dispatch_claimed_at, v_execution.created_at) then
    raise exception 'RECONCILIATION_EVIDENCE_PRECEDES_EXECUTION' using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  if p_claim_token is null or v_execution.reconciliation_claim_token is distinct from p_claim_token
     or v_execution.reconciliation_lease_expires_at is null
     or v_execution.reconciliation_lease_expires_at <= v_now then
    raise exception 'RECONCILIATION_CLAIM_TOKEN_INVALID_OR_EXPIRED' using errcode = '42501';
  end if;
  if v_checked_at > v_now + interval '5 minutes' then
    raise exception 'RECONCILIATION_CHECKED_AT_IN_FUTURE' using errcode = '22023';
  end if;
  if v_execution.authority_snapshot -> 'external_side_effects' is distinct from 'true'::jsonb
     or v_execution.action_id is null
     or (p_status = 'SUCCEEDED' and v_execution.dispatch_claimed_at is null) then
    raise exception 'EXECUTION_NOT_RECONCILABLE' using errcode = '22023';
  end if;

  select * into v_reservation from public.mission_authority_budget_reservations
   where execution_id = v_execution.id for update;
  if not found or v_reservation.status <> 'HELD_UNKNOWN' then
    raise exception 'EXECUTION_BUDGET_RESERVATION_NOT_HELD_UNKNOWN' using errcode = '22023';
  end if;
  select * into v_budget from public.mission_authority_budgets
   where id = v_reservation.budget_id
     and workspace_id = v_execution.workspace_id
     and mission_id = v_execution.mission_id
     and agent_id = v_execution.agent_id for update;
  if not found then raise exception 'AUTHORITY_BUDGET_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_reservation.currency <> v_budget.currency
     or v_budget.actions_reserved < v_reservation.reserved_actions
     or v_budget.spend_reserved < v_reservation.reserved_spend then
    raise exception 'AUTHORITY_BUDGET_ACCOUNTING_MISMATCH' using errcode = '22023';
  end if;

  if p_status = 'SUCCEEDED' then
    if v_reservation.reserved_spend > 0 then
      v_charge_json := v_receipt -> 'charge_amount';
      if jsonb_typeof(v_charge_json) is distinct from 'number' then
        raise exception 'PROVIDER_CHARGE_AMOUNT_REQUIRED' using errcode = '22023';
      end if;
      if v_receipt ->> 'currency' is distinct from v_reservation.currency then
        raise exception 'PROVIDER_CHARGE_CURRENCY_MISMATCH' using errcode = '22023';
      end if;
      v_charge := (v_charge_json #>> '{}')::numeric(20,6);
    elsif v_receipt ? 'charge_amount' then
      if jsonb_typeof(v_receipt -> 'charge_amount') is distinct from 'number' then
        raise exception 'INVALID_PROVIDER_CHARGE_AMOUNT' using errcode = '22023';
      end if;
      v_charge := ((v_receipt -> 'charge_amount') #>> '{}')::numeric(20,6);
      if v_receipt ->> 'currency' is distinct from v_reservation.currency then
        raise exception 'PROVIDER_CHARGE_CURRENCY_MISMATCH' using errcode = '22023';
      end if;
    end if;
    if v_charge::text in ('NaN', 'Infinity', '-Infinity')
       or v_charge < 0 or v_charge > v_reservation.reserved_spend then
      raise exception 'PROVIDER_CHARGE_EXCEEDS_RESERVED_CAP' using errcode = '22023';
    end if;

    update public.mission_authority_budgets
       set actions_reserved = actions_reserved - v_reservation.reserved_actions,
           actions_consumed = actions_consumed + v_reservation.reserved_actions,
           spend_reserved = spend_reserved - v_reservation.reserved_spend,
           spend_consumed = spend_consumed + v_charge,
           updated_at = clock_timestamp()
     where id = v_budget.id
       and actions_reserved >= v_reservation.reserved_actions
       and spend_reserved >= v_reservation.reserved_spend;
    if not found then raise exception 'AUTHORITY_BUDGET_ACCOUNTING_MISMATCH' using errcode = '22023'; end if;
    update public.mission_authority_budget_reservations
       set status = 'CONSUMED', charged_spend = v_charge,
           settlement_reason = 'RECONCILED_PROVIDER_SUCCESS', settled_at = clock_timestamp()
     where id = v_reservation.id;
  else
    update public.mission_authority_budgets
       set actions_reserved = actions_reserved - v_reservation.reserved_actions,
           spend_reserved = spend_reserved - v_reservation.reserved_spend,
           updated_at = clock_timestamp()
     where id = v_budget.id
       and actions_reserved >= v_reservation.reserved_actions
       and spend_reserved >= v_reservation.reserved_spend;
    if not found then raise exception 'AUTHORITY_BUDGET_ACCOUNTING_MISMATCH' using errcode = '22023'; end if;
    update public.mission_authority_budget_reservations
       set status = 'RELEASED', charged_spend = 0,
           settlement_reason = 'RECONCILED_PROVIDER_CONFIRMED_NOT_SENT', settled_at = clock_timestamp()
     where id = v_reservation.id;
  end if;

  update public.agent_executions
     set status = p_status,
         result = p_result,
         evidence = coalesce(evidence, '{}'::jsonb) || p_evidence || jsonb_build_object(
           'outcome', p_status, 'verified', false, 'safe_to_retry', p_status = 'FAILED',
           'reconciliation_required', false, 'reconciled_at', v_now
         ),
         error_code = case when p_status = 'FAILED' then 'PROVIDER_CONFIRMED_NOT_SENT' else null end,
         error_message = case when p_status = 'FAILED'
           then 'Provider reconciliation authoritatively confirmed that the request was not sent.'
           else null end,
         reconciled_at = v_now,
         reconciliation_claimed_at = null,
         reconciliation_lease_expires_at = null,
         reconciliation_claim_token = null
   where id = v_execution.id
   returning * into v_execution;

  perform public.record_mission_event(
    v_execution.mission_id, 'AGENT_EXECUTION_OUTCOME_RECONCILED',
    jsonb_build_object('execution_id', v_execution.id, 'status', v_execution.status,
      'method', v_reconciliation ->> 'method', 'provider_state', v_reconciliation ->> 'provider_state',
      'reconciled_at', v_now, 'authority_budget_revision', v_execution.dispatch_claim_budget_revision)
  );
  return v_execution;
end;
$function$;

create or replace function public.reconcile_agent_execution_outcome(
  p_execution_id uuid, p_claim_token uuid, p_status text, p_result jsonb, p_evidence jsonb
) returns public.agent_executions
language sql
set search_path = pg_catalog, public
as $function$
  select private.reconcile_agent_execution_outcome(p_execution_id, p_claim_token, p_status, p_result, p_evidence);
$function$;

revoke all on function private.reconcile_agent_execution_outcome(uuid, uuid, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.reconcile_agent_execution_outcome(uuid, uuid, text, jsonb, jsonb) to service_role;
revoke all on function public.reconcile_agent_execution_outcome(uuid, uuid, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_agent_execution_outcome(uuid, uuid, text, jsonb, jsonb) to service_role;

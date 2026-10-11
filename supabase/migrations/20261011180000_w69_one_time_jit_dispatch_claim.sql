-- W69: single-use server-side JIT claim immediately before an external side effect.
-- W68 reserves the budget atomically at start; this gate reloads authority, exact
-- approval, live versions, lease, budget and reservation immediately before send.
-- It records permission for one attempt, but does not itself perform provider I/O.
alter table public.agent_executions
  add column if not exists dispatch_claimed_at timestamptz,
  add column if not exists dispatch_claim_authority_hash text,
  add column if not exists dispatch_claim_request_hash text,
  add column if not exists dispatch_claim_budget_revision bigint;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_executions'::regclass
       and conname = 'agent_executions_dispatch_claim_consistency'
  ) then
    alter table public.agent_executions
      add constraint agent_executions_dispatch_claim_consistency
      check (
        (dispatch_claimed_at is null
          and dispatch_claim_authority_hash is null
          and dispatch_claim_request_hash is null
          and dispatch_claim_budget_revision is null)
        or
        (dispatch_claimed_at is not null
          and dispatch_claim_authority_hash is not null
          and dispatch_claim_authority_hash ~ '^[0-9a-f]{64}$'
          and dispatch_claim_request_hash is not null
          and dispatch_claim_request_hash ~ '^[0-9a-f]{64}$'
          and dispatch_claim_budget_revision is not null
          and dispatch_claim_budget_revision > 0)
      );
  end if;
end;
$constraints$;

create index if not exists agent_executions_dispatch_claimed_idx
  on public.agent_executions(dispatch_claimed_at)
  where dispatch_claimed_at is not null;

create or replace function private.claim_agent_execution_dispatch(
  p_execution_id uuid
) returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_initial public.agent_executions;
  v_execution public.agent_executions;
  v_mission public.missions;
  v_action public.mission_actions;
  v_agent public.workspace_agents;
  v_budget public.mission_authority_budgets;
  v_reservation public.mission_authority_budget_reservations;
  v_approval public.mission_approvals;
  v_expected_scope jsonb;
  v_authority_hash text;
  v_request_hash text;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;

  select * into v_initial
    from public.agent_executions
   where id = p_execution_id;
  if not found then
    raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Lock order aligns with retry/recovery: mission -> execution -> adapter scope
  -- -> reservation -> budget -> approval. No network I/O occurs inside this RPC.
  select * into v_mission
    from public.missions
   where id = v_initial.mission_id
     and workspace_id = v_initial.workspace_id
   for update;
  if not found or v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED_OR_NOT_FOUND' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;
  if not found
     or v_execution.workspace_id <> v_initial.workspace_id
     or v_execution.mission_id <> v_initial.mission_id then
    raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_execution.status <> 'RUNNING' then
    raise exception 'EXECUTION_NOT_RUNNING' using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  if v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' using errcode = '22023';
  end if;
  if v_execution.cancel_requested_at is not null then
    raise exception 'EXECUTION_CANCELLATION_REQUESTED' using errcode = '22023';
  end if;
  if v_execution.dispatch_claimed_at is not null then
    raise exception 'EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = v_execution.agent_id
     and workspace_id = v_execution.workspace_id
   for share;
  if not found or v_agent.status <> 'ACTIVE' then
    raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.authority is distinct from v_execution.authority_snapshot then
    raise exception 'AGENT_AUTHORITY_CHANGED' using errcode = '22023';
  end if;
  if v_agent.authority -> 'external_side_effects' is distinct from 'true'::jsonb
     or v_agent.authority -> 'requires_approval' is distinct from 'true'::jsonb
     or v_execution.action_id is null
     or v_execution.approval_id is null then
    raise exception 'JIT_EXTERNAL_SIDE_EFFECT_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_action
    from public.mission_actions
   where id = v_execution.action_id
     and mission_id = v_execution.mission_id
   for share;
  if not found or v_action.status not in ('PENDING', 'RUNNING') then
    raise exception 'ACTION_NOT_EXECUTABLE' using errcode = '22023';
  end if;

  select * into v_reservation
    from public.mission_authority_budget_reservations
   where execution_id = v_execution.id
   for update;
  if not found or v_reservation.status <> 'RESERVED' then
    raise exception 'EXECUTION_BUDGET_RESERVATION_NOT_OPEN' using errcode = '22023';
  end if;

  select * into v_budget
    from public.mission_authority_budgets
   where id = v_reservation.budget_id
     and workspace_id = v_execution.workspace_id
     and mission_id = v_execution.mission_id
     and agent_id = v_execution.agent_id
   for update;
  if not found or v_budget.status <> 'ACTIVE' then
    raise exception 'AUTHORITY_BUDGET_MISSING_OR_INACTIVE' using errcode = '42501';
  end if;

  v_authority_hash := encode(
    extensions.digest(convert_to(v_agent.authority::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_request_hash := encode(
    extensions.digest(convert_to(v_execution.request::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_budget.authority_hash <> v_authority_hash
     or v_execution.request ->> 'authority_budget_revision' is distinct from v_budget.authority_revision::text
     or v_reservation.currency <> v_budget.currency
     or v_reservation.reserved_actions <> 1
     or v_budget.actions_reserved < v_reservation.reserved_actions
     or v_budget.spend_reserved < v_reservation.reserved_spend
     or v_reservation.reserved_spend > v_budget.max_spend_per_action then
    raise exception 'AUTHORITY_BUDGET_BINDING_MISMATCH' using errcode = '22023';
  end if;
  if v_budget.not_before > v_now or v_budget.expires_at <= v_now then
    raise exception 'AUTHORITY_BUDGET_NOT_IN_VALIDITY_WINDOW' using errcode = '22023';
  end if;

  v_expected_scope := private.agent_execution_approval_scope(
    v_mission.workspace_id,
    v_mission.id,
    v_mission.version,
    v_action.id,
    v_action.version,
    v_agent.id,
    v_agent.authority,
    v_execution.request
  );
  select * into v_approval
    from public.mission_approvals a
   where a.id = v_execution.approval_id
     and a.mission_id = v_execution.mission_id
     and a.workspace_id = v_execution.workspace_id
     and a.action_id = v_execution.action_id
     and a.status = 'APPROVED'
     and a.decided_at is not null
     and a.expires_at > v_now
     and a.consumed_at is not null
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
    raise exception 'APPROVAL_REQUIRED_OR_SCOPE_CHANGED' using errcode = '42501';
  end if;

  update public.agent_executions
     set dispatch_claimed_at = v_now,
         dispatch_claim_authority_hash = v_authority_hash,
         dispatch_claim_request_hash = v_request_hash,
         dispatch_claim_budget_revision = v_budget.authority_revision
   where id = v_execution.id
     and status = 'RUNNING'
     and dispatch_claimed_at is null
   returning * into v_execution;
  if not found then
    raise exception 'EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH' using errcode = '22023';
  end if;

  perform public.record_mission_event(
    v_execution.mission_id,
    'AGENT_EXECUTION_DISPATCH_CLAIMED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'approval_id', v_execution.approval_id,
      'authority_budget_revision', v_budget.authority_revision,
      'dispatch_claimed_at', v_now,
      'authority_hash', v_authority_hash,
      'request_hash', v_request_hash
    )
  );
  return v_execution;
end;
$function$;

revoke all on function private.claim_agent_execution_dispatch(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.claim_agent_execution_dispatch(uuid)
  to service_role;

create or replace function public.claim_agent_execution_dispatch(
  p_execution_id uuid
) returns public.agent_executions
language sql
set search_path = pg_catalog, public
as $function$
  select private.claim_agent_execution_dispatch(p_execution_id);
$function$;

revoke all on function public.claim_agent_execution_dispatch(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_agent_execution_dispatch(uuid)
  to service_role;

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
  v_final_status text;
  v_error_code text;
  v_error_message text;
  v_final_evidence jsonb := p_evidence;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('SUCCEEDED', 'FAILED', 'UNKNOWN', 'BLOCKED') then
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

  if v_execution.authority_snapshot -> 'external_side_effects' = 'true'::jsonb
     and v_execution.dispatch_claimed_at is null
     and not (
       p_status in ('FAILED', 'BLOCKED')
       and p_evidence -> 'provider_not_sent' = 'true'::jsonb
       and p_evidence -> 'safe_to_retry' = 'true'::jsonb
     ) then
    raise exception 'DISPATCH_CLAIM_REQUIRED' using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  if v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' using errcode = '22023';
  end if;

  v_final_status := private.settle_agent_execution_budget(p_execution_id, p_status, coalesce(p_evidence, '{}'::jsonb));
  v_error_code := nullif(btrim(coalesce(p_error_code, '')), '');
  v_error_message := nullif(btrim(coalesce(p_error_message, '')), '');
  if v_final_status <> p_status then
    v_error_code := 'EXTERNAL_OUTCOME_REQUIRES_RECONCILIATION';
    v_error_message := 'No trusted evidence proves that the external action was not sent. Budget remains reserved.';
    v_final_evidence := coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
      'outcome', 'UNKNOWN',
      'verified', false,
      'safe_to_retry', false,
      'reconciliation_required', true
    );
  end if;

  update public.agent_executions
     set status = v_final_status,
         result = p_result,
         evidence = v_final_evidence,
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
  from public, anon, authenticated, service_role;
grant execute on function private.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  to service_role;

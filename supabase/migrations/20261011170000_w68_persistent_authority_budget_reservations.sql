-- W68: persist action/spend reservations on the actual agent-execution ledger.
-- External-side-effect starts fail closed unless a current authority budget exists,
-- an exact approval is bound to that budget revision, and the reservation is atomic
-- with insertion of the execution attempt. This is a budget/start fence only; it is
-- not yet a universal JIT adapter immediately before external I/O.

create table public.mission_authority_budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  mission_id uuid not null references public.missions(id) on delete restrict,
  agent_id uuid not null references public.workspace_agents(id) on delete restrict,
  authority_revision bigint not null check (authority_revision > 0),
  authority_hash text not null check (authority_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED', 'SUPERSEDED')),
  not_before timestamptz not null,
  expires_at timestamptz not null,
  action_limit bigint not null check (action_limit between 1 and 1000000),
  actions_reserved bigint not null default 0 check (actions_reserved >= 0),
  actions_consumed bigint not null default 0 check (actions_consumed >= 0),
  max_spend numeric(20,6) not null check (max_spend >= 0),
  max_spend_per_action numeric(20,6) not null check (max_spend_per_action >= 0),
  spend_reserved numeric(20,6) not null default 0 check (spend_reserved >= 0),
  spend_consumed numeric(20,6) not null default 0 check (spend_consumed >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint mission_authority_budgets_valid_window
    check (not_before < expires_at),
  constraint mission_authority_budgets_per_action_within_total
    check (max_spend_per_action <= max_spend),
  constraint mission_authority_budgets_action_accounting
    check (actions_reserved + actions_consumed <= action_limit),
  constraint mission_authority_budgets_spend_accounting
    check (spend_reserved + spend_consumed <= max_spend),
  constraint mission_authority_budgets_scope_revision_unique
    unique (workspace_id, mission_id, agent_id, authority_revision)
);

create unique index mission_authority_budgets_one_active_scope_idx
  on public.mission_authority_budgets(workspace_id, mission_id, agent_id)
  where status = 'ACTIVE';
create index mission_authority_budgets_expiry_idx
  on public.mission_authority_budgets(status, expires_at);
create index mission_authority_budgets_mission_idx
  on public.mission_authority_budgets(mission_id, agent_id, authority_revision desc);

create table public.mission_authority_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.mission_authority_budgets(id) on delete restrict,
  execution_id uuid not null unique references public.agent_executions(id) on delete restrict,
  reserved_actions bigint not null default 1 check (reserved_actions = 1),
  reserved_spend numeric(20,6) not null check (reserved_spend >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'RESERVED'
    check (status in ('RESERVED', 'CONSUMED', 'RELEASED', 'HELD_UNKNOWN')),
  charged_spend numeric(20,6) check (charged_spend is null or charged_spend >= 0),
  settlement_reason text,
  created_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz
);

create index mission_authority_budget_reservations_budget_status_idx
  on public.mission_authority_budget_reservations(budget_id, status);
create index mission_authority_budget_reservations_execution_status_idx
  on public.mission_authority_budget_reservations(execution_id, status);

alter table public.mission_authority_budgets enable row level security;
alter table public.mission_authority_budget_reservations enable row level security;
revoke all privileges on table public.mission_authority_budgets,
  public.mission_authority_budget_reservations
  from public, anon, authenticated, service_role;

create or replace function private.configure_mission_authority_budget(
  p_workspace_id uuid,
  p_mission_id uuid,
  p_agent_id uuid,
  p_action_limit bigint,
  p_max_spend numeric,
  p_max_spend_per_action numeric,
  p_currency text,
  p_expires_at timestamptz,
  p_not_before timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_existing public.mission_authority_budgets;
  v_budget public.mission_authority_budgets;
  v_revision bigint;
  v_not_before timestamptz := coalesce(p_not_before, clock_timestamp());
  v_authority_hash text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if private.workspace_role(p_workspace_id) not in ('owner', 'admin') then
    raise exception 'AUTHORITY_BUDGET_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_action_limit is null or p_action_limit < 1 or p_action_limit > 1000000
     or p_max_spend is null or p_max_spend::text in ('NaN', 'Infinity', '-Infinity')
     or p_max_spend < 0 or p_max_spend > 99999999999999.999999
     or p_max_spend_per_action is null
     or p_max_spend_per_action::text in ('NaN', 'Infinity', '-Infinity')
     or p_max_spend_per_action < 0
     or p_max_spend_per_action > p_max_spend
     or nullif(p_currency, '') is null
     or p_currency !~ '^[A-Z]{3}$'
     or p_expires_at is null
     or p_expires_at <= v_not_before
     or p_expires_at <= clock_timestamp() then
    raise exception 'INVALID_AUTHORITY_BUDGET' using errcode = '22023';
  end if;

  select * into v_mission
    from public.missions
   where id = p_mission_id and workspace_id = p_workspace_id
   for update;
  if not found then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = p_agent_id and workspace_id = p_workspace_id
   for update;
  if not found or v_agent.status <> 'ACTIVE' then
    raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.authority -> 'external_side_effects' is distinct from 'true'::jsonb
     or v_agent.authority -> 'requires_approval' is distinct from 'true'::jsonb then
    raise exception 'EXACT_APPROVAL_REQUIRED_FOR_EXTERNAL_EFFECTS' using errcode = '42501';
  end if;

  select * into v_existing
    from public.mission_authority_budgets
   where workspace_id = p_workspace_id
     and mission_id = p_mission_id
     and agent_id = p_agent_id
     and status = 'ACTIVE'
   for update;

  if found then
    if exists (
      select 1
        from public.mission_authority_budget_reservations r
       where r.budget_id = v_existing.id
         and r.status in ('RESERVED', 'HELD_UNKNOWN')
    ) then
      raise exception 'AUTHORITY_BUDGET_HAS_OPEN_RESERVATIONS' using errcode = '22023';
    end if;
    update public.mission_authority_budgets
       set status = 'SUPERSEDED',
           updated_at = clock_timestamp()
     where id = v_existing.id;
  end if;

  select coalesce(max(authority_revision), 0) + 1
    into v_revision
    from public.mission_authority_budgets
   where workspace_id = p_workspace_id
     and mission_id = p_mission_id
     and agent_id = p_agent_id;

  v_authority_hash := encode(
    extensions.digest(convert_to(v_agent.authority::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.mission_authority_budgets (
    workspace_id, mission_id, agent_id, authority_revision, authority_hash,
    status, not_before, expires_at, action_limit, max_spend,
    max_spend_per_action, currency, created_by, created_at, updated_at
  )
  values (
    p_workspace_id, p_mission_id, p_agent_id, v_revision, v_authority_hash,
    'ACTIVE', v_not_before, p_expires_at, p_action_limit, p_max_spend,
    p_max_spend_per_action, p_currency, auth.uid(), clock_timestamp(), clock_timestamp()
  )
  returning * into v_budget;

  return jsonb_build_object(
    'id', v_budget.id,
    'workspace_id', v_budget.workspace_id,
    'mission_id', v_budget.mission_id,
    'agent_id', v_budget.agent_id,
    'authority_revision', v_budget.authority_revision,
    'status', v_budget.status,
    'not_before', v_budget.not_before,
    'expires_at', v_budget.expires_at,
    'action_limit', v_budget.action_limit,
    'max_spend', v_budget.max_spend,
    'max_spend_per_action', v_budget.max_spend_per_action,
    'currency', v_budget.currency
  );
end;
$function$;

create or replace function public.configure_mission_authority_budget(
  p_workspace_id uuid,
  p_mission_id uuid,
  p_agent_id uuid,
  p_action_limit bigint,
  p_max_spend numeric,
  p_max_spend_per_action numeric,
  p_currency text,
  p_expires_at timestamptz,
  p_not_before timestamptz default null
) returns jsonb
language sql
set search_path = pg_catalog, public
as $function$
  select private.configure_mission_authority_budget(
    p_workspace_id, p_mission_id, p_agent_id, p_action_limit,
    p_max_spend, p_max_spend_per_action, p_currency, p_expires_at, p_not_before
  );
$function$;

revoke all on function private.configure_mission_authority_budget(uuid, uuid, uuid, bigint, numeric, numeric, text, timestamptz, timestamptz)
  from public, anon, service_role;
grant execute on function private.configure_mission_authority_budget(uuid, uuid, uuid, bigint, numeric, numeric, text, timestamptz, timestamptz)
  to authenticated;
revoke all on function public.configure_mission_authority_budget(uuid, uuid, uuid, bigint, numeric, numeric, text, timestamptz, timestamptz)
  from public, anon, service_role;
grant execute on function public.configure_mission_authority_budget(uuid, uuid, uuid, bigint, numeric, numeric, text, timestamptz, timestamptz)
  to authenticated;

create or replace function private.revoke_mission_authority_budget(
  p_budget_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_initial public.mission_authority_budgets;
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_budget public.mission_authority_budgets;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  select * into v_initial
    from public.mission_authority_budgets
   where id = p_budget_id;
  if not found then
    raise exception 'AUTHORITY_BUDGET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if private.workspace_role(v_initial.workspace_id) not in ('owner', 'admin') then
    raise exception 'AUTHORITY_BUDGET_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_mission
    from public.missions
   where id = v_initial.mission_id and workspace_id = v_initial.workspace_id
   for update;
  if not found then
    raise exception 'AUTHORITY_BUDGET_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_agent
    from public.workspace_agents
   where id = v_initial.agent_id and workspace_id = v_initial.workspace_id
   for update;
  if not found then
    raise exception 'AUTHORITY_BUDGET_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_budget
    from public.mission_authority_budgets
   where id = p_budget_id
   for update;

  if v_budget.status = 'ACTIVE' then
    update public.mission_authority_budgets
       set status = 'REVOKED',
           updated_at = clock_timestamp()
     where id = v_budget.id
     returning * into v_budget;
  elsif v_budget.status <> 'REVOKED' then
    raise exception 'AUTHORITY_BUDGET_NOT_ACTIVE' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_budget.id,
    'authority_revision', v_budget.authority_revision,
    'status', v_budget.status
  );
end;
$function$;

create or replace function public.revoke_mission_authority_budget(
  p_budget_id uuid
) returns jsonb
language sql
set search_path = pg_catalog, public
as $function$
  select private.revoke_mission_authority_budget(p_budget_id);
$function$;

revoke all on function private.revoke_mission_authority_budget(uuid)
  from public, anon, service_role;
grant execute on function private.revoke_mission_authority_budget(uuid)
  to authenticated;
revoke all on function public.revoke_mission_authority_budget(uuid)
  from public, anon, service_role;
grant execute on function public.revoke_mission_authority_budget(uuid)
  to authenticated;

create or replace function private.reserve_agent_execution_budget(
  p_budget_id uuid,
  p_execution_id uuid
) returns public.mission_authority_budget_reservations
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_budget public.mission_authority_budgets;
  v_execution public.agent_executions;
  v_reservation public.mission_authority_budget_reservations;
  v_authority_hash text;
begin
  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for share;
  if not found then
    raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_budget
    from public.mission_authority_budgets
   where id = p_budget_id
   for update;
  if not found or v_budget.status <> 'ACTIVE' then
    raise exception 'AUTHORITY_BUDGET_NOT_ACTIVE' using errcode = '22023';
  end if;

  v_authority_hash := encode(
    extensions.digest(convert_to(v_execution.authority_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_execution.workspace_id <> v_budget.workspace_id
     or v_execution.mission_id <> v_budget.mission_id
     or v_execution.agent_id <> v_budget.agent_id
     or v_execution.authority_snapshot -> 'external_side_effects' is distinct from 'true'::jsonb
     or v_authority_hash <> v_budget.authority_hash
     or v_execution.request ->> 'authority_budget_revision' is distinct from v_budget.authority_revision::text then
    raise exception 'AUTHORITY_BUDGET_BINDING_MISMATCH' using errcode = '22023';
  end if;
  if v_budget.not_before > clock_timestamp() or v_budget.expires_at <= clock_timestamp() then
    raise exception 'AUTHORITY_BUDGET_NOT_IN_VALIDITY_WINDOW' using errcode = '22023';
  end if;
  if v_budget.actions_reserved + v_budget.actions_consumed + 1 > v_budget.action_limit
     or v_budget.spend_reserved + v_budget.spend_consumed + v_budget.max_spend_per_action > v_budget.max_spend then
    raise exception 'AUTHORITY_BUDGET_EXHAUSTED' using errcode = '22023';
  end if;

  update public.mission_authority_budgets
     set actions_reserved = actions_reserved + 1,
         spend_reserved = spend_reserved + v_budget.max_spend_per_action,
         updated_at = clock_timestamp()
   where id = v_budget.id
     and status = 'ACTIVE'
     and actions_reserved + actions_consumed + 1 <= action_limit
     and spend_reserved + spend_consumed + max_spend_per_action <= max_spend
   returning * into v_budget;
  if not found then
    raise exception 'AUTHORITY_BUDGET_EXHAUSTED' using errcode = '22023';
  end if;

  insert into public.mission_authority_budget_reservations (
    budget_id, execution_id, reserved_actions, reserved_spend, currency, status
  )
  values (
    v_budget.id, v_execution.id, 1, v_budget.max_spend_per_action, v_budget.currency, 'RESERVED'
  )
  returning * into v_reservation;

  return v_reservation;
end;
$function$;

revoke all on function private.reserve_agent_execution_budget(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.start_agent_execution(
  p_mission_id uuid,
  p_action_id uuid,
  p_agent_id uuid,
  p_idempotency_key text,
  p_request jsonb default '{}'::jsonb
) returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_action public.mission_actions;
  v_approval public.mission_approvals;
  v_execution public.agent_executions;
  v_budget public.mission_authority_budgets;
  v_reservation public.mission_authority_budget_reservations;
  v_requires_approval boolean;
  v_external_side_effects boolean;
  v_expected_scope jsonb;
  v_authority_hash text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) < 16
     or char_length(p_idempotency_key) > 200 then
    raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'INVALID_EXECUTION_REQUEST' using errcode = '22023';
  end if;

  select * into v_mission
    from public.missions
   where id = p_mission_id
   for update;
  if not found or not private.can_edit_workspace(v_mission.workspace_id, auth.uid()) then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = p_agent_id
     and workspace_id = v_mission.workspace_id
     and status = 'ACTIVE'
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

  -- Idempotency is resolved before budget availability; replay cannot consume
  -- additional allowance or turn an old attempt into permission to dispatch.
  select * into v_execution
    from public.agent_executions
   where workspace_id = v_mission.workspace_id
     and idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_execution.mission_id <> v_mission.id
       or v_execution.agent_id <> v_agent.id
       or coalesce(v_execution.action_id, '00000000-0000-0000-0000-000000000000')
          <> coalesce(p_action_id, '00000000-0000-0000-0000-000000000000')
       or v_execution.request is distinct from p_request then
      raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode = '22023';
    end if;
    raise exception 'EXECUTION_ALREADY_EXISTS' using errcode = '22023';
  end if;

  v_requires_approval := coalesce((v_agent.authority ->> 'requires_approval')::boolean, false);
  v_external_side_effects := v_agent.authority -> 'external_side_effects' = 'true'::jsonb;

  if v_external_side_effects then
    if not v_requires_approval then
      raise exception 'EXACT_APPROVAL_REQUIRED_FOR_EXTERNAL_EFFECTS' using errcode = '42501';
    end if;
    if p_action_id is null then
      raise exception 'MISSION_ACTION_REQUIRED_FOR_EXTERNAL_EFFECTS' using errcode = '22023';
    end if;

    select * into v_budget
      from public.mission_authority_budgets
     where workspace_id = v_mission.workspace_id
       and mission_id = v_mission.id
       and agent_id = v_agent.id
       and status = 'ACTIVE'
     order by authority_revision desc
     limit 1
     for update;
    if not found then
      raise exception 'AUTHORITY_BUDGET_MISSING' using errcode = '42501';
    end if;

    v_authority_hash := encode(
      extensions.digest(convert_to(v_agent.authority::text, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_authority_hash <> v_budget.authority_hash
       or p_request ->> 'authority_budget_revision' is distinct from v_budget.authority_revision::text then
      raise exception 'AUTHORITY_BUDGET_BINDING_MISMATCH' using errcode = '22023';
    end if;
    if v_budget.not_before > clock_timestamp() or v_budget.expires_at <= clock_timestamp() then
      raise exception 'AUTHORITY_BUDGET_NOT_IN_VALIDITY_WINDOW' using errcode = '22023';
    end if;
  end if;

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

  insert into public.agent_executions (
    workspace_id, mission_id, action_id, agent_id, approval_id, requested_by,
    idempotency_key, status, authority_snapshot, request
  )
  values (
    v_mission.workspace_id, v_mission.id, p_action_id, v_agent.id,
    case when v_requires_approval then v_approval.id else null end,
    auth.uid(), p_idempotency_key, 'RUNNING', v_agent.authority, p_request
  )
  returning * into v_execution;

  if v_external_side_effects then
    select * into v_reservation
      from private.reserve_agent_execution_budget(v_budget.id, v_execution.id);
  end if;

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
      'idempotency_key', p_idempotency_key,
      'authority_budget_revision', case when v_external_side_effects then v_budget.authority_revision else null end
    )
  );
  return v_execution;
end;
$function$;

revoke all on function private.start_agent_execution(uuid, uuid, uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function private.start_agent_execution(uuid, uuid, uuid, text, jsonb)
  to authenticated;

create or replace function private.settle_agent_execution_budget(
  p_execution_id uuid,
  p_requested_status text,
  p_evidence jsonb
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_execution public.agent_executions;
  v_reservation public.mission_authority_budget_reservations;
  v_budget public.mission_authority_budgets;
  v_receipt jsonb;
  v_charge_json jsonb;
  v_charge numeric(20,6) := 0;
  v_effective_status text := p_requested_status;
  v_safe_not_sent boolean := false;
begin
  select * into v_execution
    from public.agent_executions
   where id = p_execution_id;
  if not found then
    raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_reservation
    from public.mission_authority_budget_reservations
   where execution_id = p_execution_id
   for update;

  if not found then
    if v_execution.authority_snapshot -> 'external_side_effects' = 'true'::jsonb then
      raise exception 'EXECUTION_BUDGET_RESERVATION_MISSING' using errcode = '22023';
    end if;
    return p_requested_status;
  end if;
  if v_reservation.status <> 'RESERVED' then
    raise exception 'EXECUTION_BUDGET_RESERVATION_NOT_OPEN' using errcode = '22023';
  end if;

  select * into v_budget
    from public.mission_authority_budgets
   where id = v_reservation.budget_id
   for update;
  if not found then
    raise exception 'AUTHORITY_BUDGET_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_receipt := p_evidence -> 'provider_receipt';
  v_safe_not_sent := p_evidence -> 'provider_not_sent' = 'true'::jsonb
    and p_evidence -> 'safe_to_retry' = 'true'::jsonb;

  if p_requested_status = 'SUCCEEDED' then
    if v_reservation.reserved_spend > 0 then
      v_charge_json := v_receipt -> 'charge_amount';
      if jsonb_typeof(v_charge_json) is distinct from 'number' then
        raise exception 'PROVIDER_CHARGE_AMOUNT_REQUIRED' using errcode = '22023';
      end if;
      if v_receipt ->> 'currency' is distinct from v_reservation.currency then
        raise exception 'PROVIDER_CHARGE_CURRENCY_MISMATCH' using errcode = '22023';
      end if;
      v_charge := (v_charge_json #>> '{}')::numeric(20,6);
    elsif jsonb_typeof(v_receipt) = 'object' and v_receipt ? 'charge_amount' then
      if jsonb_typeof(v_receipt -> 'charge_amount') is distinct from 'number' then
        raise exception 'INVALID_PROVIDER_CHARGE_AMOUNT' using errcode = '22023';
      end if;
      v_charge := ((v_receipt -> 'charge_amount') #>> '{}')::numeric(20,6);
      if v_receipt ->> 'currency' is distinct from v_reservation.currency then
        raise exception 'PROVIDER_CHARGE_CURRENCY_MISMATCH' using errcode = '22023';
      end if;
    end if;

    if v_charge::text in ('NaN', 'Infinity', '-Infinity')
       or v_charge < 0
       or v_charge > v_reservation.reserved_spend then
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
    if not found then
      raise exception 'AUTHORITY_BUDGET_ACCOUNTING_MISMATCH' using errcode = '22023';
    end if;

    update public.mission_authority_budget_reservations
       set status = 'CONSUMED',
           charged_spend = v_charge,
           settlement_reason = 'TRUSTED_COMPLETION_WITH_RECEIPT',
           settled_at = clock_timestamp()
     where id = v_reservation.id;
  elsif p_requested_status in ('FAILED', 'BLOCKED') and v_safe_not_sent then
    update public.mission_authority_budgets
       set actions_reserved = actions_reserved - v_reservation.reserved_actions,
           spend_reserved = spend_reserved - v_reservation.reserved_spend,
           updated_at = clock_timestamp()
     where id = v_budget.id
       and actions_reserved >= v_reservation.reserved_actions
       and spend_reserved >= v_reservation.reserved_spend;
    if not found then
      raise exception 'AUTHORITY_BUDGET_ACCOUNTING_MISMATCH' using errcode = '22023';
    end if;

    update public.mission_authority_budget_reservations
       set status = 'RELEASED',
           charged_spend = 0,
           settlement_reason = 'TRUSTED_EVIDENCE_PROVES_NOT_SENT',
           settled_at = clock_timestamp()
     where id = v_reservation.id;
  else
    v_effective_status := 'UNKNOWN';
    update public.mission_authority_budget_reservations
       set status = 'HELD_UNKNOWN',
           settlement_reason = 'NO_AUTHORITATIVE_NO_SEND_PROOF',
           settled_at = clock_timestamp()
     where id = v_reservation.id;
  end if;

  return v_effective_status;
end;
$function$;

revoke all on function private.settle_agent_execution_budget(uuid, text, jsonb)
  from public, anon, authenticated, service_role;

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

create or replace function private.retry_agent_execution(
  p_execution_id uuid,
  p_new_idempotency_key text
) returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_initial public.agent_executions;
  v_execution public.agent_executions;
  v_existing public.agent_executions;
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_action public.mission_actions;
  v_approval public.mission_approvals;
  v_budget public.mission_authority_budgets;
  v_parent_reservation public.mission_authority_budget_reservations;
  v_new_reservation public.mission_authority_budget_reservations;
  v_requires_approval boolean;
  v_external_side_effects boolean;
  v_expected_scope jsonb;
  v_authority_hash text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_new_idempotency_key is null
     or char_length(btrim(p_new_idempotency_key)) < 16
     or char_length(p_new_idempotency_key) > 200 then
    raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  select * into v_initial
    from public.agent_executions
   where id = p_execution_id;
  if not found or not private.can_edit_workspace(v_initial.workspace_id, auth.uid()) then
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
  if not found or not private.can_edit_workspace(v_execution.workspace_id, auth.uid()) then
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
  v_external_side_effects := v_agent.authority -> 'external_side_effects' = 'true'::jsonb;

  if v_external_side_effects then
    select * into v_parent_reservation
      from public.mission_authority_budget_reservations
     where execution_id = v_execution.id
     for update;
    if not found or v_parent_reservation.status <> 'RELEASED' then
      raise exception 'EXECUTION_BUDGET_NOT_RELEASED_FOR_RETRY' using errcode = '22023';
    end if;

    select * into v_budget
      from public.mission_authority_budgets
     where workspace_id = v_mission.workspace_id
       and mission_id = v_mission.id
       and agent_id = v_agent.id
       and status = 'ACTIVE'
     order by authority_revision desc
     limit 1
     for update;
    if not found then
      raise exception 'AUTHORITY_BUDGET_MISSING' using errcode = '42501';
    end if;
    v_authority_hash := encode(
      extensions.digest(convert_to(v_agent.authority::text, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_budget.authority_hash <> v_authority_hash
       or v_execution.request ->> 'authority_budget_revision' is distinct from v_budget.authority_revision::text then
      raise exception 'AUTHORITY_BUDGET_BINDING_MISMATCH' using errcode = '22023';
    end if;
    if v_budget.not_before > clock_timestamp() or v_budget.expires_at <= clock_timestamp() then
      raise exception 'AUTHORITY_BUDGET_NOT_IN_VALIDITY_WINDOW' using errcode = '22023';
    end if;
  end if;

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

  insert into public.agent_executions (
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

  if v_external_side_effects then
    select * into v_new_reservation
      from private.reserve_agent_execution_budget(v_budget.id, v_existing.id);
  end if;

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

create or replace function private.hold_unknown_execution_budget()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status = 'UNKNOWN' and old.status is distinct from new.status then
    update public.mission_authority_budget_reservations
       set status = 'HELD_UNKNOWN',
           settlement_reason = coalesce(settlement_reason, 'EXECUTION_OUTCOME_UNKNOWN'),
           settled_at = coalesce(settled_at, clock_timestamp())
     where execution_id = new.id
       and status = 'RESERVED';
  end if;
  return new;
end;
$function$;

revoke all on function private.hold_unknown_execution_budget()
  from public, anon, authenticated, service_role;
drop trigger if exists hold_unknown_execution_budget on public.agent_executions;
create trigger hold_unknown_execution_budget
after update of status on public.agent_executions
for each row
when (new.status = 'UNKNOWN' and old.status is distinct from new.status)
execute function private.hold_unknown_execution_budget();

revoke all on function public.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  to service_role;
revoke all on function private.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function private.complete_agent_execution(uuid, text, jsonb, jsonb, text, text)
  to service_role;

revoke all on function public.start_agent_execution(uuid, uuid, uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function public.start_agent_execution(uuid, uuid, uuid, text, jsonb)
  to authenticated;
revoke all on function public.retry_agent_execution(uuid, text)
  from public, anon, service_role;
grant execute on function public.retry_agent_execution(uuid, text)
  to authenticated;

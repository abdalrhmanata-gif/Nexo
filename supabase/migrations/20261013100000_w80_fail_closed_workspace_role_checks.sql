-- W80: fail closed when a workspace-role lookup returns NULL.
-- SQL's "NULL NOT IN (...)" is NULL, not TRUE; an IF that tests only that
-- expression can accidentally continue for a non-member. These RPCs must
-- reject a missing role before state changes, events, or invitation effects.

create or replace function private.can_edit_workspace(
  p_workspace_id uuid,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select coalesce(
    private.workspace_role(p_workspace_id, p_user_id) in ('owner', 'admin', 'member'),
    false
  );
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
  v_workspace_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('APPROVED', 'REJECTED', 'CANCELLED') then
    raise exception 'INVALID_APPROVAL_DECISION' using errcode = '22023';
  end if;

  select * into v_approval
    from public.mission_approvals
   where id = p_approval_id
   for update;
  if not found then
    raise exception 'APPROVAL_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  v_workspace_role := private.workspace_role(v_approval.workspace_id, auth.uid());
  if v_workspace_role is null or v_workspace_role not in ('owner', 'admin') then
    raise exception 'APPROVAL_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_approval.status <> 'PENDING' then
    raise exception 'APPROVAL_ALREADY_DECIDED' using errcode = '22023';
  end if;
  if v_approval.expires_at is not null and v_approval.expires_at <= clock_timestamp() then
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
    v_approval.mission_id,
    'APPROVAL_DECIDED',
    jsonb_build_object(
      'approval_id', v_approval.id,
      'status', v_approval.status,
      'decided_by', auth.uid(),
      'expires_at', v_approval.expires_at
    )
  );
  return v_approval;
end;
$function$;

create or replace function private.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
) returns public.workspace_invitations
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_inv public.workspace_invitations;
  v_email text := lower(btrim(p_email));
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  v_actor_role := private.workspace_role(p_workspace_id, auth.uid());
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_INVITATION_EMAIL' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('admin', 'member', 'viewer') then
    raise exception 'INVALID_INVITATION_ROLE' using errcode = '22023';
  end if;
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'INVALID_INVITATION_TOKEN' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= timezone('utc', now()) then
    raise exception 'INVITATION_EXPIRED' using errcode = '22023';
  end if;
  if exists (
    select 1
      from public.workspace_members m
      join auth.users u on u.id = m.user_id
     where m.workspace_id = p_workspace_id
       and lower(u.email) = v_email
  ) then
    raise exception 'USER_ALREADY_MEMBER' using errcode = '22023';
  end if;
  if exists (
    select 1
      from public.workspace_invitations
     where workspace_id = p_workspace_id
       and lower(email) = v_email
       and status = 'PENDING'
  ) then
    raise exception 'INVITATION_ALREADY_PENDING' using errcode = '22023';
  end if;

  insert into public.workspace_invitations(
    workspace_id, email, role, invited_by, token_hash, expires_at
  ) values (
    p_workspace_id, v_email, p_role, auth.uid(), p_token_hash, p_expires_at
  ) returning * into v_inv;

  perform private.record_workspace_activity(
    p_workspace_id,
    'WORKSPACE_INVITATION_CREATED',
    'workspace_invitation',
    v_inv.id,
    jsonb_build_object('email', v_email, 'role', p_role)
  );
  return v_inv;
end;
$function$;

create or replace function private.revoke_workspace_invitation(p_invitation_id uuid)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_inv public.workspace_invitations;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_inv
    from public.workspace_invitations
   where id = p_invitation_id
   for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = '22023';
  end if;

  v_actor_role := private.workspace_role(v_inv.workspace_id, auth.uid());
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if v_inv.status <> 'PENDING' then
    raise exception 'INVITATION_NOT_PENDING' using errcode = '22023';
  end if;

  update public.workspace_invitations
     set status = 'REVOKED'
   where id = v_inv.id
   returning * into v_inv;

  perform private.record_workspace_activity(
    v_inv.workspace_id,
    'WORKSPACE_INVITATION_REVOKED',
    'workspace_invitation',
    v_inv.id,
    jsonb_build_object('role', v_inv.role)
  );
  return v_inv;
end;
$function$;

-- Preserve trusted event semantics while hardening the role-checked recovery branch.
create or replace function private.record_mission_event(
  p_mission_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_owner_id uuid;
  v_workspace_id uuid;
  v_execution_id uuid;
  v_execution public.agent_executions;
  v_agent public.workspace_agents;
  v_actor_type text;
  v_actor_id uuid;
  v_claimed_at timestamptz;
  v_reconciliation_lease timestamptz;
  v_reconciled_at timestamptz;
  v_reservation_id uuid;
  v_reservation_status text;
begin
  if p_mission_id is null
     or p_event_type is null
     or char_length(btrim(p_event_type)) < 1
     or char_length(btrim(p_event_type)) > 100
     or p_event_type <> btrim(p_event_type)
     or jsonb_typeof(v_payload) is distinct from 'object'
     or octet_length(convert_to(v_payload::text, 'UTF8')) > 65536 then
    raise exception 'INVALID_MISSION_EVENT' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    if p_event_type not in (
      'AGENT_EXECUTION_DISPATCH_CLAIMED',
      'AGENT_EXECUTION_COMPLETED',
      'AGENT_EXECUTION_RECONCILIATION_CLAIMED',
      'AGENT_EXECUTION_OUTCOME_RECONCILED',
      'AGENT_EXECUTION_RECONCILED'
    ) then
      raise exception 'SYSTEM_EVENT_TYPE_FORBIDDEN' using errcode = '42501';
    end if;

    if jsonb_typeof(v_payload -> 'execution_id') is distinct from 'string' then
      raise exception 'SYSTEM_EVENT_EXECUTION_BINDING_REQUIRED' using errcode = '22023';
    end if;
    begin
      v_execution_id := (v_payload ->> 'execution_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'SYSTEM_EVENT_EXECUTION_BINDING_REQUIRED' using errcode = '22023';
    end;

    select m.owner_id
      into v_owner_id
      from public.missions m
     where m.id = p_mission_id;
    if not found then
      raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;

    select * into v_execution
      from public.agent_executions e
     where e.id = v_execution_id
       and e.mission_id = p_mission_id
     for update;
    if not found then
      raise exception 'SYSTEM_EVENT_EXECUTION_BINDING_MISMATCH' using errcode = '42501';
    end if;

    case p_event_type
      when 'AGENT_EXECUTION_DISPATCH_CLAIMED' then
        begin
          v_claimed_at := nullif(v_payload ->> 'dispatch_claimed_at', '')::timestamptz;
        exception when others then
          raise exception 'SYSTEM_EVENT_DISPATCH_CLAIM_MISMATCH' using errcode = '22023';
        end;
        if v_execution.dispatch_claimed_at is null
           or v_claimed_at is distinct from v_execution.dispatch_claimed_at
           or v_payload ->> 'authority_hash' is distinct from v_execution.dispatch_claim_authority_hash
           or v_payload ->> 'request_hash' is distinct from v_execution.dispatch_claim_request_hash
           or v_payload ->> 'authority_budget_revision' is distinct from v_execution.dispatch_claim_budget_revision::text then
          raise exception 'SYSTEM_EVENT_DISPATCH_CLAIM_MISMATCH' using errcode = '22023';
        end if;

      when 'AGENT_EXECUTION_COMPLETED' then
        if v_execution.status not in ('SUCCEEDED', 'FAILED', 'UNKNOWN', 'BLOCKED')
           or v_execution.completed_at is null
           or v_payload ->> 'status' is distinct from v_execution.status
           or v_payload ->> 'agent_id' is distinct from v_execution.agent_id::text
           or v_payload ->> 'action_id' is distinct from v_execution.action_id::text then
          raise exception 'SYSTEM_EVENT_COMPLETION_MISMATCH' using errcode = '22023';
        end if;

      when 'AGENT_EXECUTION_RECONCILIATION_CLAIMED' then
        begin
          v_reconciliation_lease := nullif(v_payload ->> 'lease_expires_at', '')::timestamptz;
        exception when others then
          raise exception 'SYSTEM_EVENT_RECONCILIATION_CLAIM_MISMATCH' using errcode = '22023';
        end;
        if v_execution.reconciliation_claimed_at is null
           or v_execution.reconciliation_claim_token is null
           or v_execution.reconciliation_lease_expires_at is null
           or v_reconciliation_lease is distinct from v_execution.reconciliation_lease_expires_at then
          raise exception 'SYSTEM_EVENT_RECONCILIATION_CLAIM_MISMATCH' using errcode = '22023';
        end if;

      when 'AGENT_EXECUTION_OUTCOME_RECONCILED' then
        if v_execution.reconciled_at is null
           or v_execution.reconciliation_claim_token is not null
           or v_payload ->> 'status' is distinct from v_execution.status then
          raise exception 'SYSTEM_EVENT_RECONCILIATION_MISMATCH' using errcode = '22023';
        end if;

      when 'AGENT_EXECUTION_RECONCILED' then
        if v_execution.reconciled_at is null
           or v_payload ->> 'status' is distinct from v_execution.status
           or v_payload ->> 'error_code' is distinct from v_execution.error_code then
          raise exception 'SYSTEM_EVENT_RECONCILIATION_MISMATCH' using errcode = '22023';
        end if;
    end case;

    v_actor_type := 'SYSTEM';
    v_actor_id := null;
  else
    if auth.uid() is null then
      raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
    end if;

    if p_event_type in (
      'AGENT_EXECUTION_DISPATCH_CLAIMED',
      'AGENT_EXECUTION_RECONCILIATION_CLAIMED',
      'AGENT_EXECUTION_OUTCOME_RECONCILED'
    ) then
      raise exception 'SYSTEM_EVENT_TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
    end if;

    select m.owner_id, m.workspace_id
      into v_owner_id, v_workspace_id
      from public.missions m
     where m.id = p_mission_id
       and (
         m.owner_id = auth.uid()
         or private.can_edit_workspace(m.workspace_id, auth.uid())
       );
    if not found then
      raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;

    -- Read-only research has a deliberately narrow user completion RPC (W64).
    -- Preserve its USER-attributed audit entry, while preventing that entry
    -- from being forged for a side-effecting agent or an unrelated execution.
    if p_event_type = 'AGENT_EXECUTION_COMPLETED' then
      if jsonb_typeof(v_payload -> 'execution_id') is distinct from 'string' then
        raise exception 'READ_ONLY_RESEARCH_COMPLETION_EVENT_REQUIRED' using errcode = '42501';
      end if;
      begin
        v_execution_id := (v_payload ->> 'execution_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'READ_ONLY_RESEARCH_COMPLETION_EVENT_REQUIRED' using errcode = '42501';
      end;

      select * into v_execution
        from public.agent_executions e
       where e.id = v_execution_id
         and e.mission_id = p_mission_id
         and e.requested_by = auth.uid()
       for update;
      if not found or v_execution.action_id is not null
         or v_execution.request ->> 'type' is distinct from 'read_only_research'
         or nullif(btrim(v_execution.request ->> 'request_id'), '') is null
         or v_execution.status not in ('SUCCEEDED', 'FAILED', 'UNKNOWN')
         or v_execution.completed_at is null
         or v_payload ->> 'status' is distinct from v_execution.status
         or v_payload ->> 'agent_id' is distinct from v_execution.agent_id::text
         or v_payload -> 'verified' is distinct from 'false'::jsonb
         or v_payload -> 'read_only_research' is distinct from 'true'::jsonb
         or v_payload ->> 'request_id' is distinct from v_execution.request ->> 'request_id'
         or v_execution.authority_snapshot ->> 'mode' is distinct from 'read_only'
         or v_execution.authority_snapshot -> 'external_side_effects' is distinct from 'false'::jsonb then
        raise exception 'READ_ONLY_RESEARCH_COMPLETION_EVENT_REQUIRED' using errcode = '42501';
      end if;

      select * into v_agent
        from public.workspace_agents a
       where a.id = v_execution.agent_id
         and a.workspace_id = v_execution.workspace_id
       for share;
      if not found
         or v_agent.status <> 'ACTIVE'
         or v_agent.authority ->> 'mode' is distinct from 'read_only'
         or v_agent.authority -> 'external_side_effects' is distinct from 'false'::jsonb then
        raise exception 'READ_ONLY_RESEARCH_COMPLETION_EVENT_REQUIRED' using errcode = '42501';
      end if;

      if exists (
        select 1
          from public.mission_events me
         where me.mission_id = p_mission_id
           and me.event_type = p_event_type
           and me.payload ->> 'execution_id' = v_execution_id::text
      ) then
        raise exception 'MISSION_EVENT_ALREADY_RECORDED' using errcode = '22023';
      end if;
    end if;

    -- W71 is an authenticated owner/admin recovery operation, not a provider
    -- result. Bind its USER event to the exact expired UNKNOWN ledger row and
    -- the reservation held for reconciliation.
    if p_event_type = 'AGENT_EXECUTION_RECONCILED' then
      if jsonb_typeof(v_payload -> 'execution_id') is distinct from 'string' then
        raise exception 'AUTHENTICATED_RECOVERY_EVENT_REQUIRED' using errcode = '42501';
      end if;
      begin
        v_execution_id := (v_payload ->> 'execution_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'AUTHENTICATED_RECOVERY_EVENT_REQUIRED' using errcode = '42501';
      end;

      select * into v_execution
        from public.agent_executions e
       where e.id = v_execution_id
         and e.mission_id = p_mission_id
       for update;
      if not found
         or private.workspace_role(v_workspace_id, auth.uid()) is null
         or private.workspace_role(v_workspace_id, auth.uid()) not in ('owner', 'admin')
         or v_execution.status <> 'UNKNOWN'
         or v_execution.reconciled_at is null
         or v_execution.error_code is distinct from 'EXECUTION_LEASE_EXPIRED'
         or v_payload ->> 'status' is distinct from v_execution.status
         or v_payload ->> 'error_code' is distinct from v_execution.error_code
         or v_payload -> 'safe_to_retry' is distinct from 'false'::jsonb
         or v_payload -> 'reconciliation_required' is distinct from v_execution.evidence -> 'reconciliation_required'
         or v_payload ->> 'budget_reservation_status' is distinct from v_execution.evidence ->> 'budget_reservation_status' then
        raise exception 'AUTHENTICATED_RECOVERY_EVENT_REQUIRED' using errcode = '42501';
      end if;

      select r.id, r.status
        into v_reservation_id, v_reservation_status
        from public.mission_authority_budget_reservations r
       where r.execution_id = v_execution.id;
      if v_payload ->> 'budget_reservation_id' is distinct from v_reservation_id::text
         or v_payload ->> 'budget_reservation_status' is distinct from v_reservation_status
         or (
           v_execution.evidence -> 'reconciliation_required' = 'true'::jsonb
           and (v_reservation_id is null or v_reservation_status <> 'HELD_UNKNOWN')
         ) then
        raise exception 'AUTHENTICATED_RECOVERY_EVENT_REQUIRED' using errcode = '42501';
      end if;

      if exists (
        select 1
          from public.mission_events me
         where me.mission_id = p_mission_id
           and me.event_type = p_event_type
           and me.payload ->> 'execution_id' = v_execution_id::text
      ) then
        raise exception 'MISSION_EVENT_ALREADY_RECORDED' using errcode = '22023';
      end if;
    end if;

    v_actor_type := 'USER';
    v_actor_id := auth.uid();
  end if;

  insert into public.mission_events (
    mission_id, owner_id, event_type, actor_type, actor_id, payload
  )
  values (
    p_mission_id, v_owner_id, p_event_type, v_actor_type, v_actor_id, v_payload
  );
end;
$function$;


-- Preserve W71 budget recovery, but reject missing workspace roles before state changes.
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
     or private.workspace_role(v_initial.workspace_id) is null
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
     or private.workspace_role(v_execution.workspace_id) is null
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

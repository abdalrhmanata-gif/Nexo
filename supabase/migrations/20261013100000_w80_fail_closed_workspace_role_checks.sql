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

-- Latest W78 event writer: preserve research-history integrity while failing closed on missing roles.
create or replace function public.revoke_workspace_invitation(p_invitation_id uuid)
returns public.workspace_invitations
language sql
set search_path = pg_catalog, public
as $function$
  select private.revoke_workspace_invitation(p_invitation_id);
$function$;

-- The public GET is the only SECURITY DEFINER wrapper: anon must reach the
-- tightly scoped, token-gated private lookup without receiving private-schema USAGE.
create or replace function public.get_workspace_invitation(p_token_hash text)
returns table(
  id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select * from private.get_workspace_invitation(p_token_hash);
$function$;

-- Remove Supabase's direct service_role EXECUTE grants from the public RPCs.
-- Exact direct grantees are separately asserted in W80 pgTAP.
revoke all on function public.create_workspace_invitation(uuid,text,text,text,timestamptz) from public, anon, service_role;
grant execute on function public.create_workspace_invitation(uuid,text,text,text,timestamptz) to authenticated;
revoke all on function public.get_workspace_invitation(text) from public, service_role;
grant execute on function public.get_workspace_invitation(text) to anon, authenticated;
revoke all on function public.accept_workspace_invitation(text) from public, anon, service_role;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
revoke all on function public.revoke_workspace_invitation(uuid) from public, anon, service_role;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;

-- Public mutation invitation RPCs remain SECURITY INVOKER. The token-only GET
-- is the narrow SECURITY DEFINER bridge; it delegates to a private helper whose
-- body validates the high-entropy token and returns only limited invitation metadata.
revoke all on function private.create_workspace_invitation(uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function private.create_workspace_invitation(uuid,text,text,text,timestamptz) to authenticated;
revoke all on function private.get_workspace_invitation(text) from public, anon, authenticated;
grant execute on function private.get_workspace_invitation(text) to anon, authenticated;
revoke all on function private.accept_workspace_invitation(text) from public, anon, authenticated;
grant execute on function private.accept_workspace_invitation(text) to authenticated;
revoke all on function private.revoke_workspace_invitation(uuid) from public, anon, authenticated;
grant execute on function private.revoke_workspace_invitation(uuid) to authenticated;

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
  v_run_id uuid;
  v_source_count integer;
  v_source jsonb;
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
    -- W78: a research-history row must match one completed, read-only ledger attempt.
    -- This prevents authenticated callers from fabricating past research summaries/citations.
    if p_event_type = 'RESEARCH_RUN_COMPLETED' then
      if jsonb_typeof(v_payload -> 'execution_id') is distinct from 'string'
         or jsonb_typeof(v_payload -> 'run_id') is distinct from 'string' then
        raise exception 'RESEARCH_RUN_EXECUTION_BINDING_REQUIRED' using errcode = '22023';
      end if;
      begin
        v_execution_id := (v_payload ->> 'execution_id')::uuid;
        v_run_id := (v_payload ->> 'run_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'RESEARCH_RUN_EXECUTION_BINDING_REQUIRED' using errcode = '22023';
      end;
      if v_execution_id is null or v_run_id is null then
        raise exception 'RESEARCH_RUN_EXECUTION_BINDING_REQUIRED' using errcode = '22023';
      end if;

      if (select count(*) from jsonb_object_keys(v_payload)) <> 11
         or exists (
           select 1 from jsonb_object_keys(v_payload) as payload_key(key)
            where payload_key.key not in (
              'schema_version', 'title', 'execution', 'status', 'run_id',
              'request_id', 'summary', 'sources', 'source_count', 'verified', 'execution_id'
            )
         )
         or v_payload -> 'schema_version' is distinct from '1'::jsonb
         or v_payload ->> 'title' is distinct from 'Read-only research completed'
         or v_payload ->> 'execution' is distinct from 'read_only_research'
         or v_payload ->> 'status' is distinct from 'COMPLETED'
         or v_payload -> 'verified' is distinct from 'false'::jsonb
         or jsonb_typeof(v_payload -> 'request_id') is distinct from 'string'
         or nullif(btrim(v_payload ->> 'request_id'), '') is null
         or char_length(v_payload ->> 'request_id') > 200
         or jsonb_typeof(v_payload -> 'summary') is distinct from 'string'
         or nullif(btrim(v_payload ->> 'summary'), '') is null
         or char_length(v_payload ->> 'summary') > 12000
         or jsonb_typeof(v_payload -> 'source_count') is distinct from 'number'
         or (v_payload ->> 'source_count')::numeric < 0
         or (v_payload ->> 'source_count')::numeric > 12
         or trunc((v_payload ->> 'source_count')::numeric) <> (v_payload ->> 'source_count')::numeric
         or jsonb_typeof(v_payload -> 'sources') is distinct from 'array' then
        raise exception 'RESEARCH_RUN_EVENT_INVALID' using errcode = '22023';
      end if;

      v_source_count := (v_payload ->> 'source_count')::integer;
      if jsonb_array_length(v_payload -> 'sources') <> v_source_count then
        raise exception 'RESEARCH_RUN_EVENT_INVALID' using errcode = '22023';
      end if;

      for v_source in
        select value from jsonb_array_elements(v_payload -> 'sources') as source(value)
      loop
        if jsonb_typeof(v_source) is distinct from 'object' then
          raise exception 'RESEARCH_RUN_SOURCE_INVALID' using errcode = '22023';
        end if;
        if (select count(*) from jsonb_object_keys(v_source)) <> 2
           or exists (
             select 1 from jsonb_object_keys(v_source) as source_key(key)
              where source_key.key not in ('title', 'url')
           )
           or jsonb_typeof(v_source -> 'title') is distinct from 'string'
           or nullif(btrim(v_source ->> 'title'), '') is null
           or char_length(v_source ->> 'title') > 500
           or jsonb_typeof(v_source -> 'url') is distinct from 'string'
           or (v_source ->> 'url') !~ '^https?://[^[:space:]/?#]+'
           or (v_source ->> 'url') ~ '[[:space:]]'
           or char_length(v_source ->> 'url') > 4096 then
          raise exception 'RESEARCH_RUN_SOURCE_INVALID' using errcode = '22023';
        end if;
      end loop;

      select * into v_execution
        from public.agent_executions e
       where e.id = v_execution_id
         and e.mission_id = p_mission_id
         and e.requested_by = auth.uid()
       for update;
      if not found then
        raise exception 'RESEARCH_RUN_EXECUTION_NOT_FOUND' using errcode = '42501';
      end if;

      if v_execution.status <> 'SUCCEEDED'
         or v_execution.completed_at is null
         or v_execution.action_id is not null
         or v_execution.request ->> 'type' is distinct from 'read_only_research'
         or v_execution.request ->> 'request_id' is distinct from v_payload ->> 'request_id'
         or v_execution.authority_snapshot ->> 'mode' is distinct from 'read_only'
         or v_execution.authority_snapshot -> 'external_side_effects' is distinct from 'false'::jsonb
         or v_execution.result -> 'summary' is distinct from v_payload -> 'summary'
         or v_execution.result -> 'source_count' is distinct from v_payload -> 'source_count'
         or v_execution.evidence -> 'outcome' is distinct from '"SUCCEEDED"'::jsonb
         or v_execution.evidence -> 'verified' is distinct from 'false'::jsonb
         or v_execution.evidence -> 'request_id' is distinct from v_payload -> 'request_id'
         or v_execution.evidence -> 'sources' is distinct from v_payload -> 'sources' then
        raise exception 'RESEARCH_RUN_EVENT_INVALID' using errcode = '22023';
      end if;

      if exists (
        select 1 from public.mission_events me
         where me.mission_id = p_mission_id
           and me.event_type = p_event_type
           and (
             me.payload ->> 'execution_id' = v_execution_id::text
             or me.payload ->> 'run_id' = v_run_id::text
           )
      ) then
        raise exception 'MISSION_EVENT_ALREADY_RECORDED' using errcode = '22023';
      end if;
    end if;

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

-- W68 budget administration: prevent non-member NULL roles from configuring or revoking authority.
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
  if private.workspace_role(p_workspace_id) is null
     or private.workspace_role(p_workspace_id) not in ('owner', 'admin') then
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
  if private.workspace_role(v_initial.workspace_id) is null
     or private.workspace_role(v_initial.workspace_id) not in ('owner', 'admin') then
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

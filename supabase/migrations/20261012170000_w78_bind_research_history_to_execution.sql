-- W78: bind user-attributed read-only research history to the exact durable execution.
-- A history row is accepted only when its summary, request, count and sources match the completed ledger row.

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

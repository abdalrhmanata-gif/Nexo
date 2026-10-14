-- W81: bind each Mission Research provider request to one trusted, single-use
-- claim over the live mission snapshot immediately before external dispatch.
alter table public.agent_executions
  add column if not exists research_claimed_at timestamptz,
  add column if not exists research_claim_request_hash text,
  add column if not exists research_claim_authority_hash text,
  add column if not exists research_claim_mission_version bigint;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_executions'::regclass
       and conname = 'agent_executions_research_claim_consistency'
  ) then
    alter table public.agent_executions
      add constraint agent_executions_research_claim_consistency check (
        (research_claimed_at is null
          and research_claim_request_hash is null
          and research_claim_authority_hash is null
          and research_claim_mission_version is null)
        or
        (research_claimed_at is not null
          and research_claim_request_hash is not null
          and research_claim_request_hash ~ '^[0-9a-f]{64}$'
          and research_claim_authority_hash is not null
          and research_claim_authority_hash ~ '^[0-9a-f]{64}$'
          and research_claim_mission_version is not null
          and research_claim_mission_version > 0)
      );
  end if;
end;
$constraints$;

create index if not exists agent_executions_research_claimed_idx
  on public.agent_executions(research_claimed_at)
  where research_claimed_at is not null;

create or replace function private.claim_read_only_research_execution(
  p_requested_by uuid,
  p_execution_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_initial public.agent_executions;
  v_execution public.agent_executions;
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_now timestamptz;
  v_authority_hash text;
  v_request_hash text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;
  if p_requested_by is null or p_execution_id is null
     or p_request_id is null or char_length(btrim(p_request_id)) < 16
     or char_length(p_request_id) > 200 then
    raise exception 'INVALID_RESEARCH_CLAIM_BINDING' using errcode = '22023';
  end if;

  select * into v_initial from public.agent_executions where id = p_execution_id;
  if not found or v_initial.requested_by <> p_requested_by
     or not private.can_edit_workspace(v_initial.workspace_id, p_requested_by) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  -- Match the start/completion lock order: mission -> agent -> execution.
  select * into v_mission from public.missions
   where id = v_initial.mission_id and workspace_id = v_initial.workspace_id
   for update;
  if not found or v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED_OR_NOT_FOUND' using errcode = '42501';
  end if;

  select * into v_agent from public.workspace_agents
   where id = v_initial.agent_id and workspace_id = v_initial.workspace_id
   for share;
  if not found or v_agent.status <> 'ACTIVE'
     or v_agent.authority ->> 'mode' is distinct from 'read_only'
     or v_agent.authority -> 'external_side_effects' is distinct from 'false'::jsonb
     or coalesce((v_agent.authority ->> 'requires_approval')::boolean, false)
     or v_agent.authority is distinct from v_initial.authority_snapshot then
    raise exception 'RESEARCH_AGENT_AUTHORITY_CHANGED' using errcode = '42501';
  end if;

  select * into v_execution from public.agent_executions
   where id = p_execution_id for update;
  if not found or v_execution.status <> 'RUNNING'
     or v_execution.requested_by <> p_requested_by
     or v_execution.mission_id <> v_initial.mission_id
     or v_execution.workspace_id <> v_initial.workspace_id
     or v_execution.agent_id <> v_initial.agent_id
     or v_execution.action_id is not null
     or v_execution.approval_id is not null
     or v_execution.request ->> 'type' is distinct from 'read_only_research'
     or v_execution.request ->> 'request_id' is distinct from p_request_id then
    raise exception 'READ_ONLY_RESEARCH_EXECUTION_REQUIRED' using errcode = '42501';
  end if;
  if v_execution.research_claimed_at is not null then
    raise exception 'RESEARCH_EXECUTION_ALREADY_CLAIMED' using errcode = '22023';
  end if;

  -- Take the final clock sample after all authority-bearing rows are locked.
  v_now := clock_timestamp();
  if v_execution.lease_expires_at is null or v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED' using errcode = '22023';
  end if;

  v_authority_hash := encode(extensions.digest(convert_to(v_agent.authority::text, 'UTF8'), 'sha256'), 'hex');
  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'execution_id', v_execution.id,
    'requested_by', p_requested_by,
    'request_id', p_request_id,
    'mission_id', v_mission.id,
    'mission_version', v_mission.version,
    'mission_objective', v_mission.objective,
    'agent_id', v_agent.id,
    'agent_authority_hash', v_authority_hash
  )::text, 'UTF8'), 'sha256'), 'hex');

  update public.agent_executions
     set research_claimed_at = v_now,
         research_claim_request_hash = v_request_hash,
         research_claim_authority_hash = v_authority_hash,
         research_claim_mission_version = v_mission.version,
         request = request || jsonb_build_object(
           'research_claim_mission_version', v_mission.version,
           'research_claim_request_hash', v_request_hash,
           'research_claim_authority_hash', v_authority_hash
         )
   where id = v_execution.id
     and status = 'RUNNING'
     and research_claimed_at is null
   returning * into v_execution;
  if not found then
    raise exception 'RESEARCH_EXECUTION_ALREADY_CLAIMED' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'execution_id', v_execution.id,
    'mission_id', v_mission.id,
    'requested_by', p_requested_by,
    'request_id', p_request_id,
    'mission_version', v_mission.version,
    'mission_objective', v_mission.objective,
    'authority_hash', v_authority_hash,
    'request_hash', v_request_hash,
    'claimed_at', v_now
  );
end;
$function$;

create or replace function public.claim_read_only_research_execution(
  p_requested_by uuid,
  p_execution_id uuid,
  p_request_id text
) returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $function$
  select private.claim_read_only_research_execution(p_requested_by, p_execution_id, p_request_id);
$function$;

revoke all on function private.claim_read_only_research_execution(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_read_only_research_execution(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_read_only_research_execution(uuid, uuid, text)
  to service_role;

-- Successful or uncertain completion means the network boundary may have been
-- crossed; require the persisted JIT claim. A known pre-dispatch denial can be
-- finalized FAILED without a claim and cannot represent a provider result.
create or replace function public.complete_read_only_research_execution(
  p_requested_by uuid,
  p_execution_id uuid,
  p_status text,
  p_result jsonb,
  p_evidence jsonb,
  p_error_code text default null,
  p_error_message text default null
) returns public.agent_executions
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $function$
declare
  v_execution public.agent_executions;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;
  select * into v_execution from public.agent_executions
   where id = p_execution_id and requested_by = p_requested_by;
  if not found then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_execution.research_claimed_at is null
     and not (
       (p_status = 'FAILED' and p_result = '{"reason":"RESEARCH_JIT_CLAIM_DENIED"}'::jsonb
        and p_evidence = jsonb_build_object('outcome', 'FAILED', 'verified', false,
          'request_id', v_execution.request ->> 'request_id')
        and p_error_code = 'RESEARCH_JIT_CLAIM_DENIED')
       or (p_status = 'UNKNOWN' and p_result = '{"reason":"AGENT_RESEARCH_JIT_CLAIM_UNCONFIRMED"}'::jsonb
        and p_evidence = jsonb_build_object('outcome', 'UNKNOWN', 'verified', false,
          'request_id', v_execution.request ->> 'request_id')
        and p_error_code = 'AGENT_RESEARCH_JIT_CLAIM_UNCONFIRMED')
     ) then
    raise exception 'RESEARCH_JIT_CLAIM_REQUIRED' using errcode = '42501';
  end if;
  if v_execution.research_claimed_at is not null
     and (v_execution.research_claim_request_hash is distinct from v_execution.request ->> 'research_claim_request_hash'
       or v_execution.research_claim_authority_hash is distinct from v_execution.request ->> 'research_claim_authority_hash'
       or v_execution.research_claim_mission_version is distinct from (v_execution.request ->> 'research_claim_mission_version')::bigint) then
    raise exception 'RESEARCH_JIT_CLAIM_BINDING_MISMATCH' using errcode = '42501';
  end if;
  return private.complete_read_only_research_execution(
    p_requested_by, p_execution_id, p_status, p_result, p_evidence, p_error_code, p_error_message
  );
end;
$function$;

revoke all on function public.complete_read_only_research_execution(uuid, uuid, text, jsonb, jsonb, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_read_only_research_execution(uuid, uuid, text, jsonb, jsonb, text, text)
  to service_role;

-- W56: an existing execution idempotency key is never permission to repeat
-- an external provider call. A caller must reconcile the existing attempt.
create or replace function private.start_agent_execution(
 p_mission_id uuid,
 p_action_id uuid,
 p_agent_id uuid,
 p_idempotency_key text,
 p_request jsonb default '{}'::jsonb
) returns public.agent_executions
language plpgsql
security definer
set search_path='pg_catalog','public'
as $function$
declare
 v_mission public.missions;
 v_agent public.workspace_agents;
 v_action public.mission_actions;
 v_approval public.mission_approvals;
 v_execution public.agent_executions;
 v_requires_approval boolean;
begin
 if auth.uid() is null then
  raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
 end if;
 if p_idempotency_key is null or char_length(btrim(p_idempotency_key))<16 or char_length(p_idempotency_key)>200 then
  raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode='22023';
 end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' then
  raise exception 'INVALID_EXECUTION_REQUEST' using errcode='22023';
 end if;

 select * into v_mission from public.missions where id=p_mission_id for update;
 if not found or not private.can_edit_workspace(v_mission.workspace_id) then
  raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501';
 end if;
 if v_mission.status in ('COMPLETED','CANCELLED') then
  raise exception 'MISSION_CLOSED' using errcode='22023';
 end if;

 select * into v_agent from public.workspace_agents
  where id=p_agent_id and workspace_id=v_mission.workspace_id and status='ACTIVE';
 if not found then
  raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode='42501';
 end if;

 if p_action_id is not null then
  select * into v_action from public.mission_actions
   where id=p_action_id and mission_id=v_mission.id for update;
  if not found then
   raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501';
  end if;
 end if;

 select * into v_execution from public.agent_executions
  where workspace_id=v_mission.workspace_id and idempotency_key=p_idempotency_key for update;
 if found then
  if v_execution.mission_id<>v_mission.id
     or v_execution.agent_id<>v_agent.id
     or coalesce(v_execution.action_id,'00000000-0000-0000-0000-000000000000')
        <> coalesce(p_action_id,'00000000-0000-0000-0000-000000000000') then
   raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode='22023';
  end if;
  -- Even an existing RUNNING row may represent a provider request already
  -- dispatched by another worker. Never return it as permission to dispatch
  -- again; the caller must inspect/reconcile the existing attempt.
  raise exception 'EXECUTION_ALREADY_EXISTS' using errcode='22023';
 end if;

 v_requires_approval:=coalesce((v_agent.authority->>'requires_approval')::boolean,false);
 if v_requires_approval then
  select * into v_approval from public.mission_approvals
   where mission_id=v_mission.id
     and action_id is not distinct from p_action_id
     and status='APPROVED'
   order by decided_at desc nulls last limit 1;
  if not found then
   raise exception 'APPROVAL_REQUIRED' using errcode='42501';
  end if;
 end if;

 insert into public.agent_executions(
  workspace_id,mission_id,action_id,agent_id,approval_id,requested_by,
  idempotency_key,status,authority_snapshot,request
 )
 values(
  v_mission.workspace_id,v_mission.id,p_action_id,v_agent.id,
  case when v_requires_approval then v_approval.id else null end,
  auth.uid(),p_idempotency_key,'RUNNING',v_agent.authority,p_request
 )
 returning * into v_execution;

 perform public.record_mission_event(
  v_mission.id,'AGENT_EXECUTION_STARTED',
  jsonb_build_object(
   'execution_id',v_execution.id,'agent_id',v_agent.id,
   'action_id',p_action_id,'approval_id',v_execution.approval_id,
   'idempotency_key',p_idempotency_key
  )
 );
 return v_execution;
end;
$function$;

revoke all on function private.start_agent_execution(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.start_agent_execution(uuid,uuid,uuid,text,jsonb) to authenticated;

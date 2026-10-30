-- W43 bounded agent execution runtime.
create table if not exists public.agent_executions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 mission_id uuid not null references public.missions(id) on delete cascade,
 action_id uuid references public.mission_actions(id) on delete set null,
 agent_id uuid not null references public.workspace_agents(id) on delete restrict,
 approval_id uuid references public.mission_approvals(id) on delete set null,
 requested_by uuid not null references auth.users(id),
 idempotency_key text not null,
 status text not null default 'RUNNING' check (status in ('RUNNING','SUCCEEDED','FAILED','UNKNOWN','BLOCKED')),
 authority_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(authority_snapshot)='object'),
 request jsonb not null default '{}'::jsonb check (jsonb_typeof(request)='object'),
 result jsonb, evidence jsonb, error_code text, error_message text,
 created_at timestamptz not null default timezone('utc',now()), completed_at timestamptz,
 unique(workspace_id,idempotency_key)
);
create index if not exists agent_executions_mission_idx on public.agent_executions(mission_id,created_at desc);
create index if not exists agent_executions_agent_idx on public.agent_executions(agent_id,created_at desc);
alter table public.agent_executions enable row level security;
create policy agent_executions_member_select on public.agent_executions for select using(private.is_workspace_member(workspace_id));
create policy agent_executions_editor_insert on public.agent_executions for insert with check(private.can_edit_workspace(workspace_id) and requested_by=auth.uid());
create policy agent_executions_editor_update on public.agent_executions for update using(private.can_edit_workspace(workspace_id)) with check(private.can_edit_workspace(workspace_id));
revoke all on public.agent_executions from anon;
grant select,insert,update on public.agent_executions to authenticated;

create or replace function private.start_agent_execution(p_mission_id uuid,p_action_id uuid,p_agent_id uuid,p_idempotency_key text,p_request jsonb default '{}'::jsonb) returns public.agent_executions language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_mission public.missions; v_agent public.workspace_agents; v_action public.mission_actions; v_approval public.mission_approvals; v_execution public.agent_executions; v_requires_approval boolean;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if p_idempotency_key is null or char_length(btrim(p_idempotency_key))<16 or char_length(p_idempotency_key)>200 then raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode='22023'; end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' then raise exception 'INVALID_EXECUTION_REQUEST' using errcode='22023'; end if;
 select * into v_mission from public.missions where id=p_mission_id for update;
 if not found or not private.can_edit_workspace(v_mission.workspace_id) then raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if v_mission.status in ('COMPLETED','CANCELLED') then raise exception 'MISSION_CLOSED' using errcode='22023'; end if;
 select * into v_agent from public.workspace_agents where id=p_agent_id and workspace_id=v_mission.workspace_id and status='ACTIVE';
 if not found then raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if p_action_id is not null then select * into v_action from public.mission_actions where id=p_action_id and mission_id=v_mission.id for update; if not found then raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if; end if;
 select * into v_execution from public.agent_executions where workspace_id=v_mission.workspace_id and idempotency_key=p_idempotency_key for update;
 if found then
  if v_execution.mission_id<>v_mission.id or v_execution.agent_id<>v_agent.id or coalesce(v_execution.action_id,'00000000-0000-0000-0000-000000000000')<>coalesce(p_action_id,'00000000-0000-0000-0000-000000000000') then raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode='22023'; end if;
  return v_execution;
 end if;
 v_requires_approval:=coalesce((v_agent.authority->>'requires_approval')::boolean,false);
 if v_requires_approval then
  select * into v_approval from public.mission_approvals where mission_id=v_mission.id and action_id is not distinct from p_action_id and status='APPROVED' order by decided_at desc nulls last limit 1;
  if not found then raise exception 'APPROVAL_REQUIRED' using errcode='42501'; end if;
 end if;
 insert into public.agent_executions(workspace_id,mission_id,action_id,agent_id,approval_id,requested_by,idempotency_key,status,authority_snapshot,request)
 values(v_mission.workspace_id,v_mission.id,p_action_id,v_agent.id,case when v_requires_approval then v_approval.id else null end,auth.uid(),p_idempotency_key,'RUNNING',v_agent.authority,p_request)
 returning * into v_execution;
 perform public.record_mission_event(v_mission.id,'AGENT_EXECUTION_STARTED',jsonb_build_object('execution_id',v_execution.id,'agent_id',v_agent.id,'action_id',p_action_id,'approval_id',v_execution.approval_id,'idempotency_key',p_idempotency_key));
 return v_execution;
end; $function$;

create or replace function private.complete_agent_execution(p_execution_id uuid,p_status text,p_result jsonb default null,p_evidence jsonb default null,p_error_code text default null,p_error_message text default null) returns public.agent_executions language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_execution public.agent_executions;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if p_status not in ('SUCCEEDED','FAILED','UNKNOWN','BLOCKED') then raise exception 'INVALID_EXECUTION_STATUS' using errcode='22023'; end if;
 if p_result is not null and jsonb_typeof(p_result)<>'object' then raise exception 'INVALID_EXECUTION_RESULT' using errcode='22023'; end if;
 if p_evidence is not null and jsonb_typeof(p_evidence)<>'object' then raise exception 'INVALID_EXECUTION_EVIDENCE' using errcode='22023'; end if;
 select * into v_execution from public.agent_executions where id=p_execution_id for update;
 if not found or not private.can_edit_workspace(v_execution.workspace_id) then raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if v_execution.status<>'RUNNING' then return v_execution; end if;
 update public.agent_executions set status=p_status,result=p_result,evidence=p_evidence,error_code=nullif(btrim(coalesce(p_error_code,'')),''),error_message=nullif(btrim(coalesce(p_error_message,'')),''),completed_at=timezone('utc',now()) where id=v_execution.id returning * into v_execution;
 perform public.record_mission_event(v_execution.mission_id,'AGENT_EXECUTION_COMPLETED',jsonb_build_object('execution_id',v_execution.id,'agent_id',v_execution.agent_id,'action_id',v_execution.action_id,'status',v_execution.status,'approval_id',v_execution.approval_id));
 return v_execution;
end; $function$;

create or replace function public.start_agent_execution(p_mission_id uuid,p_action_id uuid,p_agent_id uuid,p_idempotency_key text,p_request jsonb default '{}'::jsonb) returns public.agent_executions language sql set search_path='pg_catalog','public' as $$ select private.start_agent_execution(p_mission_id,p_action_id,p_agent_id,p_idempotency_key,p_request); $$;
create or replace function public.complete_agent_execution(p_execution_id uuid,p_status text,p_result jsonb default null,p_evidence jsonb default null,p_error_code text default null,p_error_message text default null) returns public.agent_executions language sql set search_path='pg_catalog','public' as $$ select private.complete_agent_execution(p_execution_id,p_status,p_result,p_evidence,p_error_code,p_error_message); $$;
revoke all on function public.start_agent_execution(uuid,uuid,uuid,text,jsonb),public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.start_agent_execution(uuid,uuid,uuid,text,jsonb),public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text) to authenticated;
revoke all on function private.start_agent_execution(uuid,uuid,uuid,text,jsonb),private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function private.start_agent_execution(uuid,uuid,uuid,text,jsonb),private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text) to authenticated;

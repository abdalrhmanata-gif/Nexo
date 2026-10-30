-- Keep workspace member mutations at the database authorization boundary.
-- Public RPCs and authenticated callers of the private helpers share these checks.
create or replace function private.update_workspace_member_role(p_member_id uuid,p_role text)
returns public.workspace_members language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_member public.workspace_members; v_actor_role text; v_owner_id uuid; v_old_role text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if p_role not in ('admin','member','viewer','owner') then raise exception 'INVALID_MEMBER_ROLE' using errcode='22023'; end if;
 select * into v_member from public.workspace_members where id=p_member_id for update;
 if not found then raise exception 'MEMBER_NOT_FOUND' using errcode='22023'; end if;
 v_old_role:=v_member.role; v_actor_role:=private.workspace_role(v_member.workspace_id,auth.uid());
 select owner_id into v_owner_id from public.workspaces where id=v_member.workspace_id;
 if v_actor_role is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
 if v_actor_role not in ('owner','admin') then raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501'; end if;
 if v_member.user_id=auth.uid() and p_role='owner' and v_member.role<>'owner' then raise exception 'SELF_OWNER_ESCALATION_FORBIDDEN' using errcode='42501'; end if;
 if v_actor_role<>'owner' and v_member.role='owner' then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
 if v_actor_role<>'owner' and p_role='owner' then raise exception 'OWNER_ESCALATION_FORBIDDEN' using errcode='42501'; end if;
 if v_member.role='owner' and p_role<>'owner' and v_member.user_id=v_owner_id then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
 update public.workspace_members set role=p_role,updated_at=timezone('utc',now()) where id=v_member.id returning * into v_member;
 perform private.record_workspace_activity(v_member.workspace_id,'MEMBER_ROLE_CHANGED','workspace_member',v_member.id,jsonb_build_object('user_id',v_member.user_id,'from_role',v_old_role,'to_role',p_role));
 return v_member;
end; $function$;

create or replace function private.remove_workspace_member(p_member_id uuid)
returns public.workspace_members language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_member public.workspace_members; v_actor_role text; v_owner_id uuid; v_owner_count integer;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select * into v_member from public.workspace_members where id=p_member_id for update;
 if not found then raise exception 'MEMBER_NOT_FOUND' using errcode='22023'; end if;
 v_actor_role:=private.workspace_role(v_member.workspace_id,auth.uid());
 select owner_id into v_owner_id from public.workspaces where id=v_member.workspace_id;
 if v_actor_role is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
 if v_member.role='owner' then
  if v_actor_role<>'owner' then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
  select count(*) into v_owner_count from public.workspace_members where workspace_id=v_member.workspace_id and role='owner';
  if v_owner_count<=1 then raise exception 'LAST_OWNER_PROTECTED' using errcode='42501'; end if;
  if v_member.user_id=v_owner_id then raise exception 'WORKSPACE_OWNER_PROTECTED' using errcode='42501'; end if;
 end if;
 if v_member.user_id<>auth.uid() and v_actor_role not in ('owner','admin') then raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501'; end if;
 if v_actor_role<>'owner' and v_member.user_id<>auth.uid() and v_member.role in ('admin','owner') then raise exception 'PRIVILEGED_MEMBER_PROTECTED' using errcode='42501'; end if;
 perform private.record_workspace_activity(v_member.workspace_id,'MEMBER_REMOVED','workspace_member',v_member.id,jsonb_build_object('user_id',v_member.user_id,'role',v_member.role));
 delete from public.workspace_members where id=v_member.id;
 return v_member;
end; $function$;

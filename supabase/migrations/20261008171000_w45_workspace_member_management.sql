-- W45 workspace member management.
create or replace function private.list_workspace_members(p_workspace_id uuid)
returns table(id uuid,user_id uuid,email text,role text,created_at timestamptz)
language plpgsql security definer set search_path='pg_catalog','public' as $function$
begin
  if auth.uid() is null or private.workspace_role(p_workspace_id,auth.uid()) is null then
    raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501';
  end if;
  return query select wm.id,wm.user_id,au.email::text,wm.role,wm.created_at
    from public.workspace_members wm join auth.users au on au.id=wm.user_id
    where wm.workspace_id=p_workspace_id order by wm.created_at;
end; $function$;

create or replace function public.list_workspace_members(p_workspace_id uuid)
returns table(id uuid,user_id uuid,email text,role text,created_at timestamptz)
language sql set search_path='pg_catalog','public' as $function$
  select * from private.list_workspace_members(p_workspace_id);
$function$;

create or replace function private.update_workspace_member_role(p_member_id uuid,p_role text)
returns public.workspace_members language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_member public.workspace_members; v_actor_role text; v_owner_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_role not in ('admin','member','viewer','owner') then raise exception 'INVALID_MEMBER_ROLE' using errcode='22023'; end if;
  select * into v_member from public.workspace_members where id=p_member_id for update;
  if not found then raise exception 'MEMBER_NOT_FOUND' using errcode='22023'; end if;
  v_actor_role:=private.workspace_role(v_member.workspace_id,auth.uid());
  select owner_id into v_owner_id from public.workspaces where id=v_member.workspace_id;
  if v_actor_role is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
  if v_member.user_id=auth.uid() and p_role='owner' and v_member.role<>'owner' then raise exception 'SELF_OWNER_ESCALATION_FORBIDDEN' using errcode='42501'; end if;
  if v_actor_role<>'owner' and v_member.role='owner' then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
  if v_actor_role<>'owner' and p_role='owner' then raise exception 'OWNER_ESCALATION_FORBIDDEN' using errcode='42501'; end if;
  if v_member.role='owner' and p_role<>'owner' and v_member.user_id=v_owner_id then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
  update public.workspace_members set role=p_role,updated_at=timezone('utc',now()) where id=v_member.id returning * into v_member;
  return v_member;
end; $function$;

create or replace function public.update_workspace_member_role(p_member_id uuid,p_role text)
returns public.workspace_members language sql set search_path='pg_catalog','public' as $function$
  select * from private.update_workspace_member_role(p_member_id,p_role);
$function$;

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
  if v_actor_role<>'owner' and v_member.user_id<>auth.uid() and v_member.role in ('admin','owner') then raise exception 'PRIVILEGED_MEMBER_PROTECTED' using errcode='42501'; end if;
  delete from public.workspace_members where id=v_member.id;
  return v_member;
end; $function$;

create or replace function public.remove_workspace_member(p_member_id uuid)
returns public.workspace_members language sql set search_path='pg_catalog','public' as $function$
  select * from private.remove_workspace_member(p_member_id);
$function$;

revoke all on function private.list_workspace_members(uuid) from public,anon,authenticated;
revoke all on function private.update_workspace_member_role(uuid,text) from public,anon,authenticated;
revoke all on function private.remove_workspace_member(uuid) from public,anon,authenticated;
revoke all on function public.list_workspace_members(uuid) from public,anon;
revoke all on function public.update_workspace_member_role(uuid,text) from public,anon;
revoke all on function public.remove_workspace_member(uuid) from public,anon;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.update_workspace_member_role(uuid,text) to authenticated;
grant execute on function public.remove_workspace_member(uuid) to authenticated;

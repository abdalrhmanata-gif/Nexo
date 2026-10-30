-- W46 workspace activity and audit center.
create table if not exists public.workspace_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now())
);
create index if not exists workspace_activity_workspace_created_idx on public.workspace_activity(workspace_id,created_at desc);
alter table public.workspace_activity enable row level security;
create policy workspace_activity_member_select on public.workspace_activity for select using(private.is_workspace_member(workspace_id));
revoke all on public.workspace_activity from anon,authenticated;

create or replace function private.record_workspace_activity(p_workspace_id uuid,p_event_type text,p_entity_type text,p_entity_id uuid,p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_id uuid;
begin
 if auth.uid() is null or private.workspace_role(p_workspace_id,auth.uid()) is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
 insert into public.workspace_activity(workspace_id,actor_user_id,event_type,entity_type,entity_id,payload)
 values(p_workspace_id,auth.uid(),p_event_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb))
 returning id into v_id;
 return v_id;
end; $function$;

create or replace function public.list_workspace_activity(p_workspace_id uuid,p_limit integer default 50)
returns table(id uuid,event_type text,entity_type text,entity_id uuid,payload jsonb,actor_user_id uuid,created_at timestamptz)
language plpgsql security definer set search_path='pg_catalog','public' as $function$
begin
 if auth.uid() is null or private.workspace_role(p_workspace_id,auth.uid()) is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
 return query select x.id,x.event_type,x.entity_type,x.entity_id,x.payload,x.actor_user_id,x.created_at
 from (
  select wa.id,wa.event_type,wa.entity_type,wa.entity_id,wa.payload,wa.actor_user_id,wa.created_at from public.workspace_activity wa where wa.workspace_id=p_workspace_id
  union all
  select me.id,me.event_type,'mission',me.mission_id,me.payload,null::uuid,me.created_at from public.mission_events me join public.missions m on m.id=me.mission_id where m.workspace_id=p_workspace_id
 ) x order by x.created_at desc limit greatest(1,least(coalesce(p_limit,50),200));
end; $function$;

revoke all on function private.record_workspace_activity(uuid,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.list_workspace_activity(uuid,integer) from public,anon;
grant execute on function public.list_workspace_activity(uuid,integer) to authenticated;

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
 if v_actor_role<>'owner' and v_member.user_id<>auth.uid() and v_member.role in ('admin','owner') then raise exception 'PRIVILEGED_MEMBER_PROTECTED' using errcode='42501'; end if;
 delete from public.workspace_members where id=v_member.id;
 perform private.record_workspace_activity(v_member.workspace_id,'MEMBER_REMOVED','workspace_member',v_member.id,jsonb_build_object('user_id',v_member.user_id,'role',v_member.role));
 return v_member;
end; $function$;

create or replace function private.create_workspace_invitation(p_workspace_id uuid,p_email text,p_role text,p_token_hash text,p_expires_at timestamptz)
returns public.workspace_invitations language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_inv public.workspace_invitations; v_email text:=lower(btrim(p_email));
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if private.workspace_role(p_workspace_id) not in ('owner','admin') then raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501'; end if;
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INVITATION_EMAIL' using errcode='22023'; end if;
 if p_role not in ('admin','member','viewer') then raise exception 'INVALID_INVITATION_ROLE' using errcode='22023'; end if;
 if p_token_hash is null or char_length(p_token_hash)<>64 then raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023'; end if;
 if p_expires_at<=timezone('utc',now()) then raise exception 'INVITATION_EXPIRED' using errcode='22023'; end if;
 if exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace_id and lower(u.email)=v_email) then raise exception 'USER_ALREADY_MEMBER' using errcode='22023'; end if;
 if exists(select 1 from public.workspace_invitations where workspace_id=p_workspace_id and lower(email)=v_email and status='PENDING') then raise exception 'INVITATION_ALREADY_PENDING' using errcode='22023'; end if;
 insert into public.workspace_invitations(workspace_id,email,role,invited_by,token_hash,expires_at) values(p_workspace_id,v_email,p_role,auth.uid(),p_token_hash,p_expires_at) returning * into v_inv;
 perform private.record_workspace_activity(p_workspace_id,'WORKSPACE_INVITATION_CREATED','workspace_invitation',v_inv.id,jsonb_build_object('email',v_email,'role',p_role));
 return v_inv;
end; $function$;

create or replace function private.accept_workspace_invitation(p_token_hash text)
returns public.workspace_invitations language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_inv public.workspace_invitations; v_email text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if p_token_hash is null or char_length(p_token_hash)<>64 then raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023'; end if;
 select * into v_inv from public.workspace_invitations where token_hash=p_token_hash for update;
 if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='22023'; end if;
 if v_inv.status<>'PENDING' then raise exception 'INVITATION_NOT_PENDING' using errcode='22023'; end if;
 if v_inv.expires_at<=timezone('utc',now()) then update public.workspace_invitations set status='EXPIRED' where id=v_inv.id; raise exception 'INVITATION_EXPIRED' using errcode='22023'; end if;
 select email into v_email from auth.users where id=auth.uid();
 if v_email is null or lower(v_email)<>lower(v_inv.email) then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
 if exists(select 1 from public.workspace_members where workspace_id=v_inv.workspace_id and user_id=auth.uid()) then raise exception 'USER_ALREADY_MEMBER' using errcode='22023'; end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(v_inv.workspace_id,auth.uid(),v_inv.role);
 update public.workspace_invitations set status='ACCEPTED',accepted_at=timezone('utc',now()) where id=v_inv.id returning * into v_inv;
 perform private.record_workspace_activity(v_inv.workspace_id,'WORKSPACE_INVITATION_ACCEPTED','workspace_invitation',v_inv.id,jsonb_build_object('user_id',auth.uid(),'role',v_inv.role));
 return v_inv;
end; $function$;

create or replace function private.revoke_workspace_invitation(p_invitation_id uuid)
returns public.workspace_invitations language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_inv public.workspace_invitations;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select * into v_inv from public.workspace_invitations where id=p_invitation_id for update;
 if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='22023'; end if;
 if private.workspace_role(v_inv.workspace_id) not in ('owner','admin') then raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501'; end if;
 if v_inv.status<>'PENDING' then raise exception 'INVITATION_NOT_PENDING' using errcode='22023'; end if;
 update public.workspace_invitations set status='REVOKED' where id=v_inv.id returning * into v_inv;
 perform private.record_workspace_activity(v_inv.workspace_id,'WORKSPACE_INVITATION_REVOKED','workspace_invitation',v_inv.id,jsonb_build_object('role',v_inv.role));
 return v_inv;
end; $function$;

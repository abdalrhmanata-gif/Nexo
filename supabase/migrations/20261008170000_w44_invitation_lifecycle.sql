-- W44 invitation lifecycle: inspect, accept and revoke invitations.
-- Raw invitation tokens are never persisted; only SHA-256 token hashes are stored.

create or replace function private.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
) returns public.workspace_invitations
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $function$
declare
  v_inv public.workspace_invitations;
  v_email text := lower(btrim(p_email));
  v_mission_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if private.workspace_role(p_workspace_id) not in ('owner','admin') then
    raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_INVITATION_EMAIL' using errcode='22023';
  end if;
  if p_role not in ('admin','member','viewer') then
    raise exception 'INVALID_INVITATION_ROLE' using errcode='22023';
  end if;
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023';
  end if;
  if p_expires_at <= timezone('utc',now()) then
    raise exception 'INVITATION_EXPIRED' using errcode='22023';
  end if;
  if exists (
    select 1 from public.workspace_members m
    join auth.users u on u.id=m.user_id
    where m.workspace_id=p_workspace_id and lower(u.email)=v_email
  ) then
    raise exception 'USER_ALREADY_MEMBER' using errcode='22023';
  end if;
  if exists (
    select 1 from public.workspace_invitations
    where workspace_id=p_workspace_id and lower(email)=v_email and status='PENDING'
  ) then
    raise exception 'INVITATION_ALREADY_PENDING' using errcode='22023';
  end if;

  insert into public.workspace_invitations(
    workspace_id,email,role,invited_by,token_hash,expires_at
  ) values (
    p_workspace_id,v_email,p_role,auth.uid(),p_token_hash,p_expires_at
  ) returning * into v_inv;

  select id into v_mission_id
  from public.missions
  where workspace_id=p_workspace_id
  order by created_at desc
  limit 1;

  if v_mission_id is not null then
    perform private.record_mission_event(
      v_mission_id,
      'WORKSPACE_INVITATION_CREATED',
      jsonb_build_object('invitation_id',v_inv.id,'email',v_email,'role',p_role)
    );
  end if;

  return v_inv;
end;
$function$;

create or replace function private.get_workspace_invitation(p_token_hash text)
returns table(
  id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $function$
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023';
  end if;

  update public.workspace_invitations
  set status='EXPIRED'
  where token_hash=p_token_hash
    and status='PENDING'
    and expires_at <= timezone('utc',now());

  return query
  select wi.id, wi.email, wi.role,
         wi.status, wi.expires_at, wi.created_at
  from public.workspace_invitations wi
  where wi.token_hash=p_token_hash
  limit 1;
end;
$function$;

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
set search_path = 'pg_catalog','public'
as $function$
  select * from private.get_workspace_invitation(p_token_hash);
$function$;

create or replace function private.accept_workspace_invitation(p_token_hash text)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $function$
declare
  v_inv public.workspace_invitations;
  v_email text;
  v_mission_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023';
  end if;

  select * into v_inv
  from public.workspace_invitations
  where token_hash=p_token_hash
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode='22023';
  end if;
  if v_inv.status <> 'PENDING' then
    raise exception 'INVITATION_NOT_PENDING' using errcode='22023';
  end if;
  if v_inv.expires_at <= timezone('utc',now()) then
    update public.workspace_invitations
    set status='EXPIRED'
    where id=v_inv.id;
    raise exception 'INVITATION_EXPIRED' using errcode='22023';
  end if;

  select email into v_email from auth.users where id=auth.uid();
  if v_email is null or lower(v_email) <> lower(v_inv.email) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501';
  end if;

  if exists (
    select 1 from public.workspace_members
    where workspace_id=v_inv.workspace_id and user_id=auth.uid()
  ) then
    raise exception 'USER_ALREADY_MEMBER' using errcode='22023';
  end if;

  insert into public.workspace_members(workspace_id,user_id,role)
  values(v_inv.workspace_id,auth.uid(),v_inv.role);

  update public.workspace_invitations
  set status='ACCEPTED', accepted_at=timezone('utc',now())
  where id=v_inv.id
  returning * into v_inv;

  select id into v_mission_id
  from public.missions
  where workspace_id=v_inv.workspace_id
  order by created_at desc
  limit 1;

  if v_mission_id is not null then
    perform private.record_mission_event(
      v_mission_id,
      'WORKSPACE_INVITATION_ACCEPTED',
      jsonb_build_object('invitation_id',v_inv.id,'member_user_id',auth.uid(),'role',v_inv.role)
    );
  end if;

  return v_inv;
end;
$function$;

create or replace function public.accept_workspace_invitation(p_token_hash text)
returns public.workspace_invitations
language sql
set search_path = 'pg_catalog','public'
as $function$
  select private.accept_workspace_invitation(p_token_hash);
$function$;

create or replace function private.revoke_workspace_invitation(p_invitation_id uuid)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $function$
declare
  v_inv public.workspace_invitations;
  v_mission_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  select * into v_inv
  from public.workspace_invitations
  where id=p_invitation_id
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode='22023';
  end if;
  if private.workspace_role(v_inv.workspace_id) not in ('owner','admin') then
    raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if v_inv.status <> 'PENDING' then
    raise exception 'INVITATION_NOT_PENDING' using errcode='22023';
  end if;

  update public.workspace_invitations
  set status='REVOKED'
  where id=v_inv.id
  returning * into v_inv;

  select id into v_mission_id
  from public.missions
  where workspace_id=v_inv.workspace_id
  order by created_at desc
  limit 1;

  if v_mission_id is not null then
    perform private.record_mission_event(
      v_mission_id,
      'WORKSPACE_INVITATION_REVOKED',
      jsonb_build_object('invitation_id',v_inv.id,'role',v_inv.role)
    );
  end if;

  return v_inv;
end;
$function$;

create or replace function public.revoke_workspace_invitation(p_invitation_id uuid)
returns public.workspace_invitations
language sql
set search_path = 'pg_catalog','public'
as $function$
  select private.revoke_workspace_invitation(p_invitation_id);
$function$;

revoke all on function private.get_workspace_invitation(text) from public,anon,authenticated;
revoke all on function private.accept_workspace_invitation(text) from public,anon,authenticated;
revoke all on function private.revoke_workspace_invitation(uuid) from public,anon,authenticated;

revoke all on function public.get_workspace_invitation(text) from public;
revoke all on function public.accept_workspace_invitation(text) from public,anon;
revoke all on function public.revoke_workspace_invitation(uuid) from public,anon;

grant execute on function public.get_workspace_invitation(text) to anon,authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;

-- W44 workspace invitations.
create table if not exists public.workspace_invitations (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 email text not null, role text not null default 'member' check (role in ('admin','member','viewer')),
 invited_by uuid not null references auth.users(id), status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
 token_hash text not null, expires_at timestamptz not null, created_at timestamptz not null default timezone('utc',now()), accepted_at timestamptz,
 unique(workspace_id,email,status)
);
create index if not exists workspace_invitations_workspace_idx on public.workspace_invitations(workspace_id,created_at desc);
alter table public.workspace_invitations enable row level security;
create policy workspace_invitations_member_select on public.workspace_invitations for select using(private.is_workspace_member(workspace_id));
create policy workspace_invitations_owner_insert on public.workspace_invitations for insert with check(private.workspace_role(workspace_id) in ('owner','admin') and invited_by=auth.uid());
create policy workspace_invitations_owner_update on public.workspace_invitations for update using(private.workspace_role(workspace_id) in ('owner','admin')) with check(private.workspace_role(workspace_id) in ('owner','admin'));
revoke all on public.workspace_invitations from anon;
grant select,insert,update on public.workspace_invitations to authenticated;

create or replace function private.create_workspace_invitation(p_workspace_id uuid,p_email text,p_role text,p_token_hash text,p_expires_at timestamptz) returns public.workspace_invitations language plpgsql security definer set search_path='pg_catalog','public' as $function$
declare v_inv public.workspace_invitations; v_email text:=lower(btrim(p_email));
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if private.workspace_role(p_workspace_id) not in ('owner','admin') then raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501'; end if;
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INVITATION_EMAIL' using errcode='22023'; end if;
 if p_role not in ('admin','member','viewer') then raise exception 'INVALID_INVITATION_ROLE' using errcode='22023'; end if;
 if p_token_hash is null or char_length(p_token_hash)<32 then raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023'; end if;
 if p_expires_at <= timezone('utc',now()) then raise exception 'INVITATION_EXPIRED' using errcode='22023'; end if;
 if exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace_id and lower(u.email)=v_email) then raise exception 'USER_ALREADY_MEMBER' using errcode='22023'; end if;
 if exists(select 1 from public.workspace_invitations where workspace_id=p_workspace_id and lower(email)=v_email and status='PENDING') then raise exception 'INVITATION_ALREADY_PENDING' using errcode='22023'; end if;
 insert into public.workspace_invitations(workspace_id,email,role,invited_by,token_hash,expires_at) values(p_workspace_id,v_email,p_role,auth.uid(),p_token_hash,p_expires_at) returning * into v_inv;
 return v_inv;
end; $function$;
create or replace function public.create_workspace_invitation(p_workspace_id uuid,p_email text,p_role text,p_token_hash text,p_expires_at timestamptz) returns public.workspace_invitations language sql set search_path='pg_catalog','public' as $$ select private.create_workspace_invitation(p_workspace_id,p_email,p_role,p_token_hash,p_expires_at); $$;
revoke all on function public.create_workspace_invitation(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.create_workspace_invitation(uuid,text,text,text,timestamptz) to authenticated;

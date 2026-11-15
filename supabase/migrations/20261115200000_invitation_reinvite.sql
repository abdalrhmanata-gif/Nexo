-- Let the same address be invited again.
--
-- workspace_invitations carried unique (workspace_id, email, status). That
-- was meant to allow one open invitation per address, but it also allowed
-- only one revoked, one accepted and one expired. Revoking a second
-- invitation to the same person failed, and so did inviting back someone who
-- had been removed. The rule that was wanted is one PENDING invitation per
-- address, which is what the partial index below says.
--
-- No rows are changed or removed. Production held no invitations when this
-- was written.

alter table public.workspace_invitations
  drop constraint if exists workspace_invitations_workspace_id_email_status_key;

create unique index if not exists workspace_invitations_one_pending_uidx
  on public.workspace_invitations (workspace_id, lower(email))
  where status = 'PENDING';

-- An invitation nobody opened stays PENDING after it expires, and blocked a
-- new one to the same address with INVITATION_ALREADY_PENDING. Creating an
-- invitation now closes the stale one first. Everything else is unchanged.
create or replace function private.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text, p_token_hash text, p_expires_at timestamp with time zone)
 returns public.workspace_invitations
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_inv public.workspace_invitations;
  v_email text := lower(btrim(p_email));
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  -- Preserve W80's explicit NULL role guard. NULL NOT IN (...) is NULL and
  -- must never be allowed to fall through an IF condition.
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
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
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

  update public.workspace_invitations
     set status = 'EXPIRED'
   where workspace_id = p_workspace_id
     and lower(email) = v_email
     and status = 'PENDING'
     and expires_at <= timezone('utc', now());

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

  -- Preserve the current W80 activity/audit contract.
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

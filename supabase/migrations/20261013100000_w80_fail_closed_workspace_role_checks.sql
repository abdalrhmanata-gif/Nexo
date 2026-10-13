-- W80: fail closed when a workspace-role lookup returns NULL.
-- SQL's "NULL NOT IN (...)" is NULL, not TRUE; an IF that tests only that
-- expression can accidentally continue for a non-member. These RPCs must
-- reject a missing role before state changes, events, or invitation effects.

create or replace function private.decide_mission_approval(
  p_approval_id uuid,
  p_decision text,
  p_note text default null
) returns public.mission_approvals
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_approval public.mission_approvals;
  v_workspace_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('APPROVED', 'REJECTED', 'CANCELLED') then
    raise exception 'INVALID_APPROVAL_DECISION' using errcode = '22023';
  end if;

  select * into v_approval
    from public.mission_approvals
   where id = p_approval_id
   for update;
  if not found then
    raise exception 'APPROVAL_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  v_workspace_role := private.workspace_role(v_approval.workspace_id, auth.uid());
  if v_workspace_role is null or v_workspace_role not in ('owner', 'admin') then
    raise exception 'APPROVAL_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_approval.status <> 'PENDING' then
    raise exception 'APPROVAL_ALREADY_DECIDED' using errcode = '22023';
  end if;
  if v_approval.expires_at is not null and v_approval.expires_at <= clock_timestamp() then
    raise exception 'APPROVAL_EXPIRED' using errcode = '22023';
  end if;

  update public.mission_approvals
     set status = p_decision,
         decided_by = auth.uid(),
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = clock_timestamp()
   where id = v_approval.id
   returning * into v_approval;

  perform public.record_mission_event(
    v_approval.mission_id,
    'APPROVAL_DECIDED',
    jsonb_build_object(
      'approval_id', v_approval.id,
      'status', v_approval.status,
      'decided_by', auth.uid(),
      'expires_at', v_approval.expires_at
    )
  );
  return v_approval;
end;
$function$;

create or replace function private.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
) returns public.workspace_invitations
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_inv public.workspace_invitations;
  v_email text := lower(btrim(p_email));
  v_mission_id uuid;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  v_actor_role := private.workspace_role(p_workspace_id, auth.uid());
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_INVITATION_EMAIL' using errcode='22023';
  end if;
  if p_role is null or p_role not in ('admin', 'member', 'viewer') then
    raise exception 'INVALID_INVITATION_ROLE' using errcode='22023';
  end if;
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023';
  end if;
  if p_expires_at is null or p_expires_at <= timezone('utc', now()) then
    raise exception 'INVITATION_EXPIRED' using errcode='22023';
  end if;
  if exists (
    select 1 from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id and lower(u.email) = v_email
  ) then
    raise exception 'USER_ALREADY_MEMBER' using errcode='22023';
  end if;
  if exists (
    select 1 from public.workspace_invitations
    where workspace_id = p_workspace_id and lower(email) = v_email and status = 'PENDING'
  ) then
    raise exception 'INVITATION_ALREADY_PENDING' using errcode='22023';
  end if;

  insert into public.workspace_invitations(
    workspace_id, email, role, invited_by, token_hash, expires_at
  ) values (
    p_workspace_id, v_email, p_role, auth.uid(), p_token_hash, p_expires_at
  ) returning * into v_inv;

  select id into v_mission_id
    from public.missions
   where workspace_id = p_workspace_id
   order by created_at desc
   limit 1;

  if v_mission_id is not null then
    perform private.record_mission_event(
      v_mission_id,
      'WORKSPACE_INVITATION_CREATED',
      jsonb_build_object('invitation_id', v_inv.id, 'email', v_email, 'role', p_role)
    );
  end if;
  return v_inv;
end;
$function$;

create or replace function private.revoke_workspace_invitation(p_invitation_id uuid)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_inv public.workspace_invitations;
  v_mission_id uuid;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  select * into v_inv
    from public.workspace_invitations
   where id = p_invitation_id
   for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode='22023';
  end if;

  v_actor_role := private.workspace_role(v_inv.workspace_id, auth.uid());
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if v_inv.status <> 'PENDING' then
    raise exception 'INVITATION_NOT_PENDING' using errcode='22023';
  end if;

  update public.workspace_invitations
     set status = 'REVOKED'
   where id = v_inv.id
   returning * into v_inv;

  select id into v_mission_id
    from public.missions
   where workspace_id = v_inv.workspace_id
   order by created_at desc
   limit 1;

  if v_mission_id is not null then
    perform private.record_mission_event(
      v_mission_id,
      'WORKSPACE_INVITATION_REVOKED',
      jsonb_build_object('invitation_id', v_inv.id, 'role', v_inv.role)
    );
  end if;
  return v_inv;
end;
$function$;

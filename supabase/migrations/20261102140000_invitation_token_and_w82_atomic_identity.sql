-- Additive integrity follow-up for invitation token identity and AI reservation races.
-- Historical migrations remain immutable. This migration is applied only through
-- the reviewed migration pipeline; it is not applied to any hosted database here.

do $preflight$
begin
  if exists (
    select 1 from public.workspace_invitations
    group by token_hash having count(*) > 1
  ) then
    raise exception 'DUPLICATE_WORKSPACE_INVITATION_TOKEN_HASHES';
  end if;
  if exists (
    select 1 from public.workspace_invitations
    where token_hash is null or token_hash !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'INVALID_EXISTING_WORKSPACE_INVITATION_TOKEN_HASH';
  end if;
end;
$preflight$;

create unique index workspace_invitations_token_hash_uidx
  on public.workspace_invitations(token_hash);

alter table public.workspace_invitations
  add constraint workspace_invitations_token_hash_check
  check (token_hash ~ '^[0-9a-f]{64}$');

-- Validate the digest at the database boundary, not only in the web route.
create or replace function private.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
) returns public.workspace_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
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
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' then
    raise exception 'INVALID_INVITATION_EMAIL' using errcode='22023';
  end if;
  if p_role is null or p_role not in ('admin','member','viewer') then
    raise exception 'INVALID_INVITATION_ROLE' using errcode='22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023';
  end if;
  if p_expires_at is null or p_expires_at <= timezone('utc',now()) then
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

-- A monthly usage row is not a global idempotency lock: requests on opposite
-- sides of a UTC month boundary can lock different rows. The unique
-- (user_id, request_id) reservation key is therefore resolved atomically by
-- INSERT ... ON CONFLICT. An unrelated unique violation is never swallowed.
create or replace function private.reserve_ai_generation(
  p_request_id text,
  p_generation_kind text,
  p_request_hash text
)
returns table (
  allowed boolean,
  reservation_id uuid,
  period_start date,
  plan text,
  monthly_limit integer,
  generations_used integer,
  remaining integer,
  reason text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_plan text;
  v_limit integer;
  v_used integer;
  v_existing_kind text;
  v_existing_hash text;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_request_id, ''))) not between 16 and 200
     or p_generation_kind is null
     or p_generation_kind not in ('planner', 'research')
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_GENERATION_REQUEST' using errcode = '22023';
  end if;

  select e.plan, e.monthly_limit into v_plan, v_limit
    from public.ai_entitlements e where e.user_id = v_user_id;
  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce(v_limit, 5);

  insert into public.ai_usage_monthly(user_id, period_start, plan, monthly_limit)
  values (v_user_id, v_period_start, v_plan, v_limit)
  on conflict on constraint ai_usage_monthly_pkey do nothing;
  select u.generations_used into v_used
    from public.ai_usage_monthly u
   where u.user_id = v_user_id and u.period_start = v_period_start for update;

  update public.ai_usage_reservations r
     set state = 'unknown', resolved_at = timezone('utc', now())
   where r.user_id = v_user_id and r.period_start = v_period_start
     and r.state = 'reserved' and r.expires_at < timezone('utc', now());

  select r.generation_kind, r.request_hash
    into v_existing_kind, v_existing_hash
    from public.ai_usage_reservations r
   where r.user_id = v_user_id and r.request_id = btrim(p_request_id)
   for update;
  if found then
    if v_existing_kind is distinct from p_generation_kind
       or v_existing_hash is distinct from p_request_hash then
      raise exception 'AI_REQUEST_ID_REUSED_WITH_DIFFERENT_INPUT' using errcode = '22023';
    end if;
    return query select false, null::uuid, v_period_start, v_plan, v_limit,
      v_used, greatest(v_limit - v_used, 0), 'duplicate_request'::text;
    return;
  end if;

  if v_used >= v_limit then
    return query select false, null::uuid, v_period_start, v_plan, v_limit, v_used, 0, 'quota_exceeded'::text;
    return;
  end if;

  update public.ai_usage_monthly m
     set plan = v_plan, monthly_limit = v_limit, updated_at = timezone('utc', now())
   where m.user_id = v_user_id and m.period_start = v_period_start;

  insert into public.ai_usage_reservations(user_id, period_start, request_id, generation_kind, request_hash)
  values (v_user_id, v_period_start, btrim(p_request_id), p_generation_kind, p_request_hash)
  on conflict (user_id, request_id) do nothing
  returning id into v_reservation_id;

  if v_reservation_id is null then
    -- Another transaction won the global identity key. ON CONFLICT waits for
    -- its outcome; this subsequent statement sees the committed reservation.
    select r.generation_kind, r.request_hash
      into v_existing_kind, v_existing_hash
      from public.ai_usage_reservations r
     where r.user_id = v_user_id and r.request_id = btrim(p_request_id)
     for update;
    if not found then
      raise exception 'AI_RESERVATION_IDENTITY_CONFLICT' using errcode = '23505';
    end if;
    if v_existing_kind is distinct from p_generation_kind
       or v_existing_hash is distinct from p_request_hash then
      raise exception 'AI_REQUEST_ID_REUSED_WITH_DIFFERENT_INPUT' using errcode = '22023';
    end if;
    return query select false, null::uuid, v_period_start, v_plan, v_limit,
      coalesce(v_used, 0), greatest(v_limit - coalesce(v_used, 0), 0), 'duplicate_request'::text;
    return;
  end if;

  update public.ai_usage_monthly m
     set generations_used = m.generations_used + 1, updated_at = timezone('utc', now())
   where m.user_id = v_user_id and m.period_start = v_period_start
  returning m.generations_used into v_used;

  return query select true, v_reservation_id, v_period_start, v_plan, v_limit, v_used,
    greatest(v_limit - v_used, 0), null::text;
end;
$function$;

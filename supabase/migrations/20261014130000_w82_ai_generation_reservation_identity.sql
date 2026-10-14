-- Bind an AI-generation reservation to the authenticated requester, route, and
-- request id. A stable key can represent one provider attempt only.
alter table public.ai_usage_reservations
  drop constraint if exists ai_usage_reservations_state_check;
alter table public.ai_usage_reservations
  add constraint ai_usage_reservations_state_check
  check (state in ('reserved','consumed','released','unknown'));

alter table public.ai_usage_reservations
  add column if not exists generation_kind text,
  add column if not exists request_hash text;

alter table public.ai_usage_reservations
  drop constraint if exists ai_usage_reservations_generation_kind_check;
alter table public.ai_usage_reservations
  add constraint ai_usage_reservations_generation_kind_check
  check (generation_kind is null or generation_kind in ('planner', 'research'));

alter table public.ai_usage_reservations
  drop constraint if exists ai_usage_reservations_request_hash_check;
alter table public.ai_usage_reservations
  add constraint ai_usage_reservations_request_hash_check
  check (request_hash is null or request_hash ~ '^[0-9a-f]{64}$');

drop function public.reserve_ai_generation(text);
drop function private.reserve_ai_generation(text);

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
  v_existing_state text;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_request_id, ''))) not between 16 and 200
     or p_generation_kind not in ('planner', 'research')
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_GENERATION_REQUEST' using errcode = '22023';
  end if;

  select e.plan, e.monthly_limit into v_plan, v_limit
    from public.ai_entitlements e where e.user_id = v_user_id;
  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce(v_limit, 5);

  insert into public.ai_usage_monthly(user_id, period_start, plan, monthly_limit)
  values (v_user_id, v_period_start, v_plan, v_limit)
  on conflict (user_id, period_start) do nothing;
  select u.generations_used into v_used
    from public.ai_usage_monthly u
   where u.user_id = v_user_id and u.period_start = v_period_start for update;

  -- Resolve expired reservations for this identity before looking for a retry.
  update public.ai_usage_reservations r
     set state = 'unknown', resolved_at = timezone('utc', now())
   where r.user_id = v_user_id and r.period_start = v_period_start
     and r.state = 'reserved' and r.expires_at < timezone('utc', now());
  -- Expired outcomes are ambiguous: retain their quota charge and idempotency
  -- record instead of reopening the key and risking another provider call.

  select r.generation_kind, r.request_hash
    into v_existing_kind, v_existing_hash, v_existing_state
    from public.ai_usage_reservations r
   where r.user_id = v_user_id and r.request_id = btrim(p_request_id)
   for update;
  if found then
    if v_existing_kind is distinct from p_generation_kind
       or v_existing_hash is distinct from p_request_hash then
      raise exception 'AI_REQUEST_ID_REUSED_WITH_DIFFERENT_INPUT' using errcode = '22023';
    end if;
    -- Returning the same id never authorizes another provider invocation.
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
  returning id into v_reservation_id;
  update public.ai_usage_monthly m
     set generations_used = m.generations_used + 1, updated_at = timezone('utc', now())
   where m.user_id = v_user_id and m.period_start = v_period_start
  returning m.generations_used into v_used;
  return query select true, v_reservation_id, v_period_start, v_plan, v_limit, v_used,
    greatest(v_limit - v_used, 0), null::text;
exception when unique_violation then
  select r.generation_kind, r.request_hash
    into v_existing_kind, v_existing_hash
    from public.ai_usage_reservations r
   where r.user_id = v_user_id and r.request_id = btrim(p_request_id);
  if found and (v_existing_kind is distinct from p_generation_kind
      or v_existing_hash is distinct from p_request_hash) then
    raise exception 'AI_REQUEST_ID_REUSED_WITH_DIFFERENT_INPUT' using errcode = '22023';
  end if;
  return query select false, null::uuid, v_period_start, v_plan, v_limit,
    coalesce(v_used, 0), greatest(v_limit - coalesce(v_used, 0), 0), 'duplicate_request'::text;
end;
$function$;

create or replace function private.consume_ai_generation(p_reservation_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.ai_usage_reservations r
     set state = 'consumed', resolved_at = timezone('utc', now())
   where r.id = p_reservation_id and r.user_id = v_user_id
     and r.state = 'reserved' and r.expires_at > timezone('utc', now());
  return found;
end;
$function$;

create or replace function private.release_ai_generation(p_reservation_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare v_user_id uuid := auth.uid(); v_period_start date;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.ai_usage_reservations r
     set state = 'released', resolved_at = timezone('utc', now())
   where r.id = p_reservation_id and r.user_id = v_user_id
     and r.state = 'reserved' and r.expires_at > timezone('utc', now())
  returning r.period_start into v_period_start;
  if found then
    update public.ai_usage_monthly m
       set generations_used = greatest(m.generations_used - 1, 0), updated_at = timezone('utc', now())
     where m.user_id = v_user_id and m.period_start = v_period_start;
    return true;
  end if;
  return false;
end;
$function$;

create or replace function public.reserve_ai_generation(p_request_id text, p_generation_kind text, p_request_hash text)
returns table (
  allowed boolean, reservation_id uuid, period_start date, plan text,
  monthly_limit integer, generations_used integer, remaining integer, reason text
)
language sql security invoker
set search_path = pg_catalog, public
as $function$
  select * from private.reserve_ai_generation(p_request_id,p_generation_kind,p_request_hash);
$function$;

revoke all on function public.reserve_ai_generation(text, text, text) from public, anon;
grant execute on function public.reserve_ai_generation(text, text, text) to authenticated;
revoke all on function private.reserve_ai_generation(text, text, text) from public, anon;
grant execute on function private.reserve_ai_generation(text, text, text) to authenticated;
revoke all on function private.consume_ai_generation(uuid) from public, anon;
grant execute on function private.consume_ai_generation(uuid) to authenticated;
revoke all on function private.release_ai_generation(uuid) from public, anon;
grant execute on function private.release_ai_generation(uuid) to authenticated;

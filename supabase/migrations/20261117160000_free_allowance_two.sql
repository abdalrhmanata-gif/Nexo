-- Free gets 2 AI briefs or Mission plans a month instead of 1.
--
-- A first try that misses leaves a new user with nothing left to try, so
-- Free now has a second. The paid limits are unchanged: Plus 10, Pro 30,
-- Scale 90. Existing Free rows, this month's included, move to 2; usage
-- already counted stays.

alter table public.ai_entitlements drop constraint if exists ai_entitlements_monthly_limit_check;
alter table public.ai_usage_monthly drop constraint if exists ai_usage_monthly_monthly_limit_check;

update public.ai_entitlements set monthly_limit = 2, updated_at = timezone('utc', now())
 where plan = 'free' and monthly_limit = 1;
update public.ai_usage_monthly set monthly_limit = 2, updated_at = timezone('utc', now())
 where plan = 'free' and monthly_limit = 1;

alter table public.ai_entitlements
  add constraint ai_entitlements_monthly_limit_check
  check ((plan = 'free' and monthly_limit = 2)
      or (plan = 'plus' and monthly_limit = 10)
      or (plan = 'pro' and monthly_limit = 30)
      or (plan = 'scale' and monthly_limit = 90));
alter table public.ai_usage_monthly
  add constraint ai_usage_monthly_monthly_limit_check
  check ((plan = 'free' and monthly_limit = 2)
      or (plan = 'plus' and monthly_limit = 10)
      or (plan = 'pro' and monthly_limit = 30)
      or (plan = 'scale' and monthly_limit = 90));

-- The three places that fall back to Free when a person has no row yet.
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
  v_limit := coalesce(v_limit, 2);

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

create or replace function private.refresh_billing_plan(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_plan text;
  v_limit integer;
begin
  select s.plan into v_plan
    from private.billing_subscriptions s
   where s.user_id = p_user_id
     and s.status in ('active', 'trialing')
     and s.plan <> 'free'
   order by case s.plan when 'scale' then 3 when 'pro' then 2 when 'plus' then 1 else 0 end desc
   limit 1;
  v_plan := coalesce(v_plan, 'free');
  v_limit := case v_plan when 'scale' then 90 when 'pro' then 30 when 'plus' then 10 else 2 end;

  insert into public.ai_entitlements (user_id, plan, monthly_limit, updated_at)
  values (p_user_id, v_plan, v_limit, timezone('utc', now()))
  on conflict (user_id) do update
    set plan = excluded.plan, monthly_limit = excluded.monthly_limit, updated_at = excluded.updated_at;

  -- Show the new limit this month straight away. Usage already counted stays.
  update public.ai_usage_monthly
     set plan = v_plan, monthly_limit = v_limit, updated_at = timezone('utc', now())
   where user_id = p_user_id
     and period_start = date_trunc('month', timezone('utc', now()))::date;
  return v_plan;
end;
$function$;

create or replace function private.billing_overview()
returns table (plan text, status text, cancel_at_period_end boolean, current_period_end timestamptz,
               monthly_limit integer, generations_used integer)
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return query
  select coalesce(e.plan, 'free'),
         s.status,
         coalesce(s.cancel_at_period_end, false),
         s.current_period_end,
         coalesce(e.monthly_limit, 2),
         coalesce(u.generations_used, 0)
    from (select 1) one
    left join public.ai_entitlements e on e.user_id = v_user_id
    left join lateral (
      select bs.status, bs.cancel_at_period_end, bs.current_period_end
        from private.billing_subscriptions bs
       where bs.user_id = v_user_id
       order by (bs.status in ('active', 'trialing')) desc, bs.updated_at desc
       limit 1) s on true
    left join public.ai_usage_monthly u
      on u.user_id = v_user_id and u.period_start = date_trunc('month', timezone('utc', now()))::date;
end;
$function$;

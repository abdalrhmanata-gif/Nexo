-- W33: set the Free plan AI-generation allowance to five per UTC month.
-- Explicit constraint targets and target-table aliases keep table columns distinct from RETURNS TABLE variables.
CREATE OR REPLACE FUNCTION private.get_ai_usage()
 RETURNS TABLE(period_start date, plan text, monthly_limit integer, generations_used integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_plan text;
  v_limit integer;
  v_used integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select e.plan, e.monthly_limit
    into v_plan, v_limit
    from public.ai_entitlements e
   where e.user_id = v_user_id;

  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce(v_limit, 5);

  insert into public.ai_usage_monthly (
    user_id, period_start, plan, monthly_limit
  )
  values (
    v_user_id, v_period_start, v_plan, v_limit
  )
  on conflict on constraint ai_usage_monthly_pkey do nothing;

  select u.generations_used
    into v_used
    from public.ai_usage_monthly u
   where u.user_id = v_user_id
     and u.period_start = v_period_start;

  return query
  select v_period_start, v_plan, v_limit, coalesce(v_used, 0),
         greatest(v_limit - coalesce(v_used, 0), 0);
end;
$function$;

CREATE OR REPLACE FUNCTION private.reserve_ai_generation(p_request_id text)
 RETURNS TABLE(allowed boolean, reservation_id uuid, period_start date, plan text, monthly_limit integer, generations_used integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_plan text;
  v_limit integer;
  v_used integer;
  v_reservation_id uuid;
  v_expired_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_request_id, ''))) not between 16 and 200 then
    raise exception 'INVALID_REQUEST_ID' using errcode = '22023';
  end if;

  select e.plan, e.monthly_limit
    into v_plan, v_limit
    from public.ai_entitlements e
   where e.user_id = v_user_id;

  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce(v_limit, 5);

  insert into public.ai_usage_monthly (
    user_id, period_start, plan, monthly_limit
  )
  values (
    v_user_id, v_period_start, v_plan, v_limit
  )
  on conflict on constraint ai_usage_monthly_pkey do nothing;

  select u.generations_used
    into v_used
    from public.ai_usage_monthly u
   where u.user_id = v_user_id
     and u.period_start = v_period_start
   for update;

  delete from public.ai_usage_reservations r
   where r.user_id = v_user_id
     and r.period_start = v_period_start
     and r.state = 'reserved'
     and r.expires_at < timezone('utc', now());

  get diagnostics v_expired_count = row_count;

  if v_expired_count > 0 then
    v_used := greatest(v_used - v_expired_count, 0);
    update public.ai_usage_monthly as m
       set generations_used = v_used,
           plan = v_plan,
           monthly_limit = v_limit,
           updated_at = timezone('utc', now())
     where m.user_id = v_user_id
       and m.period_start = v_period_start;
  else
    update public.ai_usage_monthly as m
       set plan = v_plan,
           monthly_limit = v_limit,
           updated_at = timezone('utc', now())
     where m.user_id = v_user_id
       and m.period_start = v_period_start;
  end if;

  if v_used >= v_limit then
    return query
    select false, null::uuid, v_period_start, v_plan, v_limit, v_used, 0;
    return;
  end if;

  insert into public.ai_usage_reservations (
    user_id, period_start, request_id
  )
  values (
    v_user_id, v_period_start, btrim(p_request_id)
  )
  returning id into v_reservation_id;

  update public.ai_usage_monthly as m
     set generations_used = m.generations_used + 1,
         updated_at = timezone('utc', now())
   where m.user_id = v_user_id
     and m.period_start = v_period_start
  returning m.generations_used into v_used;

  return query
  select true, v_reservation_id, v_period_start, v_plan, v_limit, v_used,
         greatest(v_limit - v_used, 0);
exception
  when unique_violation then
    return query
    select false, null::uuid, v_period_start, v_plan, v_limit, v_used,
           greatest(v_limit - coalesce(v_used, 0), 0);
end;
$function$;


-- Keep the entitlement source of truth and new monthly ledger rows aligned.
update public.ai_entitlements set monthly_limit = 5 where plan = 'free';
alter table public.ai_entitlements alter column monthly_limit set default 5;
alter table public.ai_usage_monthly alter column monthly_limit set default 5;

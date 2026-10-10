-- W22 AI usage quota and reservation boundary.
-- Development first; promote through the normal migration/review path only.

create table public.ai_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  monthly_limit integer not null default 20 check (monthly_limit in (20, 300)),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.ai_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  plan text not null check (plan in ('free', 'plus')),
  monthly_limit integer not null check (monthly_limit in (20, 300)),
  generations_used integer not null default 0 check (generations_used >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, period_start)
);

create table public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  request_id text not null,
  state text not null default 'reserved' check (state in ('reserved', 'consumed', 'released')),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '2 minutes'),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  unique (user_id, request_id)
);

create index ai_usage_reservations_expiry_idx
  on public.ai_usage_reservations (user_id, period_start, state, expires_at);

alter table public.ai_entitlements enable row level security;
alter table public.ai_usage_monthly enable row level security;
alter table public.ai_usage_reservations enable row level security;

revoke all on public.ai_entitlements from anon, authenticated;
revoke all on public.ai_usage_monthly from anon, authenticated;
revoke all on public.ai_usage_reservations from anon, authenticated;

create or replace function public.get_ai_usage()
returns table (
  period_start date,
  plan text,
  monthly_limit integer,
  generations_used integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
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

  select e.plan, e.monthly_limit into v_plan, v_limit
    from public.ai_entitlements e where e.user_id = v_user_id;

  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce(v_limit, 20);

  insert into public.ai_usage_monthly (user_id, period_start, plan, monthly_limit)
  values (v_user_id, v_period_start, v_plan, v_limit)
  on conflict (user_id, period_start) do nothing;

  select u.generations_used into v_used
    from public.ai_usage_monthly u
   where u.user_id = v_user_id and u.period_start = v_period_start;

  return query
  select v_period_start, v_plan, v_limit, coalesce(v_used, 0),
         greatest(v_limit - coalesce(v_used, 0), 0);
end;
$$;

create or replace function public.reserve_ai_generation(p_request_id text)
returns table (
  allowed boolean,
  reservation_id uuid,
  period_start date,
  plan text,
  monthly_limit integer,
  generations_used integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
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

  select e.plan, e.monthly_limit into v_plan, v_limit
    from public.ai_entitlements e where e.user_id = v_user_id;

  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce(v_limit, 20);

  insert into public.ai_usage_monthly (user_id, period_start, plan, monthly_limit)
  values (v_user_id, v_period_start, v_plan, v_limit)
  on conflict (user_id, period_start) do nothing;

  select u.generations_used into v_used
    from public.ai_usage_monthly u
   where u.user_id = v_user_id and u.period_start = v_period_start
   for update;

  delete from public.ai_usage_reservations r
   where r.user_id = v_user_id
     and r.period_start = v_period_start
     and r.state = 'reserved'
     and r.expires_at < timezone('utc', now());

  get diagnostics v_expired_count = row_count;

  if v_expired_count > 0 then
    v_used := greatest(v_used - v_expired_count, 0);
  end if;

  update public.ai_usage_monthly
     set generations_used = v_used,
         plan = v_plan,
         monthly_limit = v_limit,
         updated_at = timezone('utc', now())
   where user_id = v_user_id and period_start = v_period_start;

  if v_used >= v_limit then
    return query
    select false, null::uuid, v_period_start, v_plan, v_limit, v_used, 0;
    return;
  end if;

  insert into public.ai_usage_reservations (user_id, period_start, request_id)
  values (v_user_id, v_period_start, btrim(p_request_id))
  returning id into v_reservation_id;

  update public.ai_usage_monthly
     set generations_used = generations_used + 1,
         updated_at = timezone('utc', now())
   where user_id = v_user_id and period_start = v_period_start
  returning generations_used into v_used;

  return query
  select true, v_reservation_id, v_period_start, v_plan, v_limit, v_used,
         greatest(v_limit - v_used, 0);
exception
  when unique_violation then
    return query
    select false, null::uuid, v_period_start, v_plan, v_limit, v_used,
           greatest(v_limit - coalesce(v_used, 0), 0);
end;
$$;

create or replace function public.consume_ai_generation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.ai_usage_reservations
     set state = 'consumed', resolved_at = timezone('utc', now())
   where id = p_reservation_id and user_id = v_user_id and state = 'reserved';

  return found;
end;
$$;

create or replace function public.release_ai_generation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_start date;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.ai_usage_reservations
     set state = 'released', resolved_at = timezone('utc', now())
   where id = p_reservation_id and user_id = v_user_id and state = 'reserved'
  returning period_start into v_period_start;

  if found then
    update public.ai_usage_monthly
       set generations_used = greatest(generations_used - 1, 0),
           updated_at = timezone('utc', now())
     where user_id = v_user_id and period_start = v_period_start;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.get_ai_usage() to authenticated;
grant execute on function public.reserve_ai_generation(text) to authenticated;
grant execute on function public.consume_ai_generation(uuid) to authenticated;
grant execute on function public.release_ai_generation(uuid) to authenticated;

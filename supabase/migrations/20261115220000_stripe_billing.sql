-- Stripe billing: paid plans, and the AI limits that follow them.
--
-- The approved plans are Free 1, Plus 10, Pro 30 and Scale 90 AI briefs or
-- Mission plans a month. The quota already lives in ai_entitlements and
-- reserve_ai_generation; this migration changes the numbers, adds Scale, and
-- adds the tables through which Stripe changes a person's plan.
--
-- Who can change billing state: only the service role, through
-- apply_stripe_event, which the stripe-webhook Edge Function calls after it
-- has verified Stripe's signature. Nothing here trusts the browser.
--
-- Price ids are data in private.billing_prices, seeded per project: Sandbox
-- ids in Development, live ids in Production when that is reviewed.
--
-- Review before applying to Production: existing usage and entitlement rows
-- are moved to the new limits below, which lowers Free from 5 to 1.

-- 1. Limits -----------------------------------------------------------------

alter table public.ai_entitlements drop constraint if exists ai_entitlements_plan_check;
alter table public.ai_entitlements drop constraint if exists ai_entitlements_monthly_limit_check;
alter table public.ai_usage_monthly drop constraint if exists ai_usage_monthly_plan_check;
alter table public.ai_usage_monthly drop constraint if exists ai_usage_monthly_monthly_limit_check;

update public.ai_entitlements
   set monthly_limit = case plan when 'plus' then 10 when 'pro' then 30 else 1 end,
       plan = case when plan in ('plus', 'pro') then plan else 'free' end;
update public.ai_usage_monthly
   set monthly_limit = case plan when 'plus' then 10 when 'pro' then 30 else 1 end,
       plan = case when plan in ('plus', 'pro') then plan else 'free' end;

alter table public.ai_entitlements
  add constraint ai_entitlements_plan_check check (plan in ('free', 'plus', 'pro', 'scale')),
  add constraint ai_entitlements_monthly_limit_check
  check ((plan = 'free' and monthly_limit = 1)
      or (plan = 'plus' and monthly_limit = 10)
      or (plan = 'pro' and monthly_limit = 30)
      or (plan = 'scale' and monthly_limit = 90));
alter table public.ai_usage_monthly
  add constraint ai_usage_monthly_plan_check check (plan in ('free', 'plus', 'pro', 'scale')),
  add constraint ai_usage_monthly_monthly_limit_check
  check ((plan = 'free' and monthly_limit = 1)
      or (plan = 'plus' and monthly_limit = 10)
      or (plan = 'pro' and monthly_limit = 30)
      or (plan = 'scale' and monthly_limit = 90));

-- The quota function, unchanged except that a person with no entitlement
-- row is on Free with 1 a month. A plan change reaches the current month on
-- the next reservation: the function reads ai_entitlements every time and
-- copies plan and limit onto the month's row.
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
  v_limit := coalesce(v_limit, 1);

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


-- 2. Billing state ----------------------------------------------------------

create table if not exists private.billing_prices (
  price_id text primary key check (price_id ~ '^price_[A-Za-z0-9]+$'),
  plan text not null check (plan in ('plus', 'pro', 'scale')),
  livemode boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (plan, livemode)
);

create table if not exists private.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique check (customer_id ~ '^cus_[A-Za-z0-9]+$'),
  livemode boolean not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.billing_subscriptions (
  subscription_id text primary key check (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null,
  price_id text,
  plan text not null check (plan in ('free', 'plus', 'pro', 'scale')),
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  livemode boolean not null,
  last_event_created bigint not null,
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists billing_subscriptions_user_idx on private.billing_subscriptions (user_id);

create table if not exists private.billing_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null,
  created bigint not null,
  livemode boolean not null,
  status text not null check (status in ('processed', 'ignored', 'failed')),
  detail jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default timezone('utc', now())
);

revoke all on private.billing_prices, private.billing_customers, private.billing_subscriptions, private.billing_events
  from public, anon, authenticated;

-- 3. Applying a plan ------------------------------------------------------------

-- The highest plan among the person's subscriptions that Stripe calls active
-- or trialing. Anything else (past_due, unpaid, canceled, incomplete, an
-- unknown price) leaves them on Free. Cancel at period end keeps the status
-- active until the period is over, so the plan lasts until then.
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
  v_limit := case v_plan when 'scale' then 90 when 'pro' then 30 when 'plus' then 10 else 1 end;

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

-- Link a Stripe customer to a ZAVQERA user, once. Returns null when it is
-- linked, or the reason it was refused.
create or replace function private.link_billing_customer(p_user_id uuid, p_customer_id text, p_livemode boolean)
returns text
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_existing_customer text;
  v_existing_user uuid;
begin
  if p_user_id is null or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$' then
    return 'missing user or customer';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return 'unknown user';
  end if;
  select c.user_id into v_existing_user from private.billing_customers c where c.customer_id = p_customer_id;
  if v_existing_user is not null and v_existing_user <> p_user_id then
    return 'customer is linked to another user';
  end if;
  select c.customer_id into v_existing_customer from private.billing_customers c where c.user_id = p_user_id;
  if v_existing_customer is not null and v_existing_customer <> p_customer_id then
    return 'user is linked to another customer';
  end if;
  -- checkout.session.completed and customer.subscription.created arrive
  -- together and both link the same pair; whichever is second must not fail
  -- on either unique index (measured 2026-11-16: the second got a 500 and
  -- only succeeded on Stripe's retry). Then confirm what is stored.
  insert into private.billing_customers (user_id, customer_id, livemode)
  values (p_user_id, p_customer_id, p_livemode)
  on conflict do nothing;
  if not exists (select 1 from private.billing_customers c
                  where c.user_id = p_user_id and c.customer_id = p_customer_id) then
    return 'customer is linked to another user';
  end if;
  return null;
end;
$function$;

create or replace function private.uuid_or_null(p_value text)
returns uuid
language sql
immutable
as $function$
  select case when p_value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then p_value::uuid end;
$function$;

-- One Stripe event, applied once. Returns processed, duplicate, ignored or
-- failed; the Edge Function answers 500 to failed so that Stripe retries,
-- and a retried event that failed before is processed again.
create or replace function private.apply_stripe_event(p_event jsonb)
returns text
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_event_id text := p_event->>'id';
  v_type text := p_event->>'type';
  v_created bigint;
  v_livemode boolean := coalesce((p_event->>'livemode')::boolean, false);
  v_object jsonb := p_event->'data'->'object';
  v_claimed text;
  v_status text := 'processed';
  v_detail jsonb := '{}'::jsonb;
  v_user_id uuid;
  v_customer_id text;
  v_subscription_id text;
  v_price_id text;
  v_plan text;
  v_refusal text;
  v_period_end bigint;
begin
  if v_event_id is null or v_event_id !~ '^evt_[A-Za-z0-9]+$' or v_type is null or v_object is null
     or (p_event->>'created') !~ '^[0-9]+$' then
    raise exception 'INVALID_STRIPE_EVENT' using errcode = '22023';
  end if;
  v_created := (p_event->>'created')::bigint;

  insert into private.billing_events (event_id, type, created, livemode, status)
  values (v_event_id, v_type, v_created, v_livemode, 'processed')
  on conflict (event_id) do update
    set status = 'processed', received_at = timezone('utc', now())
    where private.billing_events.status = 'failed'
  returning event_id into v_claimed;
  if v_claimed is null then
    return 'duplicate';
  end if;

  begin
    if v_type = 'checkout.session.completed' then
      if v_object->>'mode' is distinct from 'subscription' then
        v_status := 'ignored'; v_detail := jsonb_build_object('reason', 'not a subscription checkout');
      else
        v_user_id := private.uuid_or_null(v_object->>'client_reference_id');
        v_customer_id := v_object->>'customer';
        v_refusal := private.link_billing_customer(v_user_id, v_customer_id, v_livemode);
        if v_refusal is not null then
          v_status := 'ignored'; v_detail := jsonb_build_object('reason', v_refusal, 'customer', v_customer_id, 'attention', true);
        else
          -- A subscription event that arrived first may already be stored.
          perform private.refresh_billing_plan(v_user_id);
          v_detail := jsonb_build_object('customer', v_customer_id, 'subscription', v_object->>'subscription');
        end if;
      end if;

    elsif v_type in ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted') then
      v_subscription_id := v_object->>'id';
      v_customer_id := v_object->>'customer';
      select c.user_id into v_user_id from private.billing_customers c where c.customer_id = v_customer_id;
      if v_user_id is null then
        -- Out of order: the subscription arrived before the checkout that
        -- links its customer. Our server put the user id in the
        -- subscription's metadata when it created the session.
        v_user_id := private.uuid_or_null(v_object->'metadata'->>'user_id');
        v_refusal := private.link_billing_customer(v_user_id, v_customer_id, v_livemode);
        if v_refusal is not null then
          v_user_id := null;
        end if;
      end if;
      if v_user_id is null then
        v_status := 'ignored';
        v_detail := jsonb_build_object('reason', coalesce(v_refusal, 'unknown customer'), 'customer', v_customer_id, 'attention', true);
      else
        v_price_id := v_object->'items'->'data'->0->'price'->>'id';
        select p.plan into v_plan from private.billing_prices p where p.price_id = v_price_id and p.livemode = v_livemode;
        v_period_end := coalesce(
          nullif(v_object->'items'->'data'->0->>'current_period_end', '')::bigint,
          nullif(v_object->>'current_period_end', '')::bigint);
        insert into private.billing_subscriptions (
          subscription_id, user_id, customer_id, price_id, plan, status,
          cancel_at_period_end, current_period_end, livemode, last_event_created, updated_at)
        values (
          v_subscription_id, v_user_id, v_customer_id, v_price_id, coalesce(v_plan, 'free'),
          coalesce(v_object->>'status', 'incomplete'),
          -- The Customer Portal on this API version cancels by setting
          -- cancel_at to the period end and leaves cancel_at_period_end
          -- false (measured 2026-11-16). Either means "ends then".
          coalesce((v_object->>'cancel_at_period_end')::boolean, false) or nullif(v_object->>'cancel_at', '') is not null,
          case when nullif(v_object->>'cancel_at', '') is not null then to_timestamp((v_object->>'cancel_at')::bigint)
               when v_period_end is null then null
               else to_timestamp(v_period_end) end,
          v_livemode, v_created, timezone('utc', now()))
        on conflict (subscription_id) do update
          set price_id = excluded.price_id,
              plan = excluded.plan,
              status = excluded.status,
              cancel_at_period_end = excluded.cancel_at_period_end,
              current_period_end = excluded.current_period_end,
              last_event_created = excluded.last_event_created,
              updated_at = excluded.updated_at
          where private.billing_subscriptions.last_event_created <= excluded.last_event_created
            and private.billing_subscriptions.user_id = excluded.user_id;
        v_plan := private.refresh_billing_plan(v_user_id);
        v_detail := jsonb_build_object('subscription', v_subscription_id, 'status', v_object->>'status', 'plan', v_plan,
          'ends', nullif(v_object->>'cancel_at', ''));
      end if;

    elsif v_type in ('invoice.paid', 'invoice.payment_failed', 'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created') then
      -- Recorded for review. Access follows the subscription events, which
      -- carry the state these lead to (a failed renewal makes it past_due).
      v_detail := jsonb_strip_nulls(jsonb_build_object(
        'customer', v_object->>'customer',
        'subscription', coalesce(v_object->'parent'->'subscription_details'->>'subscription', v_object->>'subscription'),
        'charge', case when v_type like 'charge.%' or v_type like 'radar.%' then coalesce(v_object->>'charge', v_object->>'id') end,
        'amount', coalesce(v_object->>'amount_paid', v_object->>'amount_due', v_object->>'amount_refunded', v_object->>'amount'),
        'currency', v_object->>'currency',
        'attention', case when v_type in ('invoice.payment_failed', 'charge.dispute.created', 'radar.early_fraud_warning.created') then true end));

    else
      v_status := 'ignored';
      v_detail := jsonb_build_object('reason', 'event type not handled');
    end if;
  exception when others then
    v_status := 'failed';
    v_detail := jsonb_build_object('error', sqlerrm);
  end;

  update private.billing_events set status = v_status, detail = v_detail where event_id = v_event_id;
  return v_status;
end;
$function$;

create or replace function public.apply_stripe_event(p_event jsonb)
returns text
language sql
set search_path = 'pg_catalog', 'public'
as $function$ select private.apply_stripe_event(p_event); $function$;

revoke all on function private.apply_stripe_event(jsonb) from public, anon, authenticated;
revoke all on function private.refresh_billing_plan(uuid) from public, anon, authenticated;
revoke all on function private.link_billing_customer(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.apply_stripe_event(jsonb) from public, anon, authenticated;
grant execute on function private.apply_stripe_event(jsonb) to service_role;
grant execute on function public.apply_stripe_event(jsonb) to service_role;

-- 4. What the signed-in person may read ------------------------------------

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
         coalesce(e.monthly_limit, 1),
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

-- What the checkout and portal routes need: the price for a plan, the
-- person's own customer, and whether they already have a subscription. The
-- routes never take any of these from the browser.
create or replace function private.billing_checkout_context(p_plan text, p_livemode boolean)
returns table (price_id text, customer_id text, has_subscription boolean)
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
  select (select p.price_id from private.billing_prices p where p.plan = p_plan and p.livemode = p_livemode),
         (select c.customer_id from private.billing_customers c where c.user_id = v_user_id and c.livemode = p_livemode),
         exists (select 1 from private.billing_subscriptions s
                  where s.user_id = v_user_id and s.livemode = p_livemode
                    and s.status in ('active', 'trialing', 'past_due', 'unpaid'));
end;
$function$;

create or replace function public.billing_overview()
returns table (plan text, status text, cancel_at_period_end boolean, current_period_end timestamptz,
               monthly_limit integer, generations_used integer)
language sql
set search_path = 'pg_catalog', 'public'
as $function$ select * from private.billing_overview(); $function$;

create or replace function public.billing_checkout_context(p_plan text, p_livemode boolean)
returns table (price_id text, customer_id text, has_subscription boolean)
language sql
set search_path = 'pg_catalog', 'public'
as $function$ select * from private.billing_checkout_context(p_plan, p_livemode); $function$;

revoke all on function private.billing_overview() from public, anon;
revoke all on function private.billing_checkout_context(text, boolean) from public, anon;
revoke all on function public.billing_overview() from public, anon;
revoke all on function public.billing_checkout_context(text, boolean) from public, anon;
grant execute on function private.billing_overview() to authenticated;
grant execute on function private.billing_checkout_context(text, boolean) to authenticated;
grant execute on function public.billing_overview() to authenticated;
grant execute on function public.billing_checkout_context(text, boolean) to authenticated;

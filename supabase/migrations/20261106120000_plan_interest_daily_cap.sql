-- A daily ceiling on the interest list.
--
-- record_plan_interest is callable by anon, which it has to be: the people
-- worth hearing from have not signed up. That also means anyone can call it in
-- a loop. The function records nothing about the caller — deliberately — so
-- there is no per-person rate limit available, and adding one would mean
-- storing an IP address and rewriting the privacy notice to say so.
--
-- A ceiling needs none of that. Above it the function simply stops accepting
-- rows for the day, so the worst case is bounded in advance rather than
-- discovered when a free-tier database fills up. Real interest at this stage
-- is a handful a day; 500 is far above any honest volume and far below any
-- volume that costs anything.

create or replace function public.record_plan_interest(
  p_email text,
  p_plan text,
  p_locale text,
  p_consent_text text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_plan text;
  v_today integer;
begin
  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return;
  end if;

  v_plan := btrim(coalesce(p_plan, ''));
  if v_plan not in ('Plus', 'Pro') then
    return;
  end if;

  select count(*) into v_today
  from public.plan_interest
  where created_at >= current_date;

  if v_today >= 500 then
    -- Silently, like every other rejection here. Telling the caller it had hit
    -- a limit would tell them a limit exists and what it is.
    return;
  end if;

  insert into public.plan_interest (email, plan, locale, consent_text)
  values (
    v_email,
    v_plan,
    nullif(left(btrim(coalesce(p_locale, '')), 8), ''),
    left(btrim(coalesce(p_consent_text, '')), 500)
  )
  on conflict (email, plan) do nothing;
end;
$$;

comment on function public.record_plan_interest(text, text, text, text) is
  'Records interest in a plan. Records nothing about the caller, answers identically in every case, and accepts at most 500 new rows per day so an open endpoint cannot fill the database.';

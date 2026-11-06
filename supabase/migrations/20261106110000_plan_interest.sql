-- Capturing intent, before there is anything to buy.
--
-- The pricing page advertises three plans and sells none of them. A visitor
-- who would have paid has nowhere to say so, and the product's largest gap is
-- that nobody knows whether anyone wants it. This records "I would pay for
-- Plus" without a payment provider, a price, or a promise.
--
-- Unlike page_metrics, this IS personal data: an email address, given
-- deliberately. So it is held to a stricter standard — consent as the legal
-- basis, a purpose recorded with each row, and no read path through the API.

create table if not exists public.plan_interest (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plan text not null,
  locale text,
  created_at timestamptz not null default now(),
  -- What the person was told they were agreeing to, stored with the row. A
  -- consent you cannot evidence is not a consent, and the wording changes
  -- over time.
  consent_text text not null,
  unique (email, plan)
);

comment on table public.plan_interest is
  'People who asked to be told when a plan becomes available. Personal data, collected on consent (Article 6(1)(a)). Written only through record_plan_interest().';

alter table public.plan_interest enable row level security;
revoke all on table public.plan_interest from anon, authenticated;

-- The only write surface. SECURITY DEFINER so the table stays closed, and
-- callable by anon because a visitor who has not signed up is exactly the one
-- worth hearing from. It validates, it does not read anything back, and it
-- cannot be used to discover whether an address is already recorded: the same
-- answer is returned either way.
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
begin
  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return;
  end if;

  v_plan := btrim(coalesce(p_plan, ''));
  if v_plan not in ('Plus', 'Pro') then
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
  'Records interest in a plan. Returns nothing either way, so it cannot be used to test whether an address is already on the list.';

revoke all on function public.record_plan_interest(text, text, text, text) from public;
grant execute on function public.record_plan_interest(text, text, text, text) to anon, authenticated;

-- How many people want each plan, without exposing who they are. The owner
-- reads addresses from the table itself when there is something to tell them.
create or replace view public.plan_interest_summary as
select
  plan,
  count(*)::int as people,
  min(created_at)::date as first_asked,
  max(created_at)::date as last_asked
from public.plan_interest
group by plan
order by people desc;

comment on view public.plan_interest_summary is 'Counts per plan. Contains no personal data.';

revoke all on public.plan_interest_summary from anon, authenticated;

-- A fourth plan, and the reason this needed a migration at all.
--
-- record_plan_interest() validates the plan name against a fixed list and
-- returns nothing either way, so that the function cannot be used to discover
-- whether an address is already recorded. The cost of that silence is that an
-- unknown plan name is discarded without a word: the pricing page would show
-- a Scale card, the visitor would submit their address, the form would say
-- "noted", and nothing would be written.
--
-- So the list is widened here in step with the page. A test asserts the two
-- agree, because the next tier will have the same failure waiting for it.

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
  if v_plan not in ('Plus', 'Pro', 'Scale', 'Team') then
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
  'Records interest in a plan or capability (Plus, Pro, Scale or Team). Returns nothing either way, so it cannot be used to test whether an address is already on the list.';

revoke all on function public.record_plan_interest(text, text, text, text) from public;
grant execute on function public.record_plan_interest(text, text, text, text) to anon, authenticated;

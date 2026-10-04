-- W34: enforce exact quota by plan after reducing Free to five.
alter table public.ai_entitlements drop constraint if exists ai_entitlements_monthly_limit_check;
alter table public.ai_entitlements
  add constraint ai_entitlements_monthly_limit_check
  check ((plan = 'free' and monthly_limit = 5) or (plan = 'plus' and monthly_limit = 300));

alter table public.ai_usage_monthly drop constraint if exists ai_usage_monthly_monthly_limit_check;
alter table public.ai_usage_monthly
  add constraint ai_usage_monthly_monthly_limit_check
  check ((plan = 'free' and monthly_limit = 5) or (plan = 'plus' and monthly_limit = 300));

-- W36: allow all release-candidate AI plan identities.
-- W34 already enforces exact allowances: Free=5, Plus=50, Pro=300.
-- Development already contains W35 for the allowance alignment; this migration
-- only removes the older Free/Plus-only identity checks inherited from W22.
alter table public.ai_entitlements
  drop constraint if exists ai_entitlements_plan_check;
alter table public.ai_entitlements
  add constraint ai_entitlements_plan_check
  check (plan in ('free', 'plus', 'pro'));

alter table public.ai_usage_monthly
  drop constraint if exists ai_usage_monthly_plan_check;
alter table public.ai_usage_monthly
  add constraint ai_usage_monthly_plan_check
  check (plan in ('free', 'plus', 'pro'));

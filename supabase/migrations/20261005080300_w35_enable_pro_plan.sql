-- W35: complete AI plan tier support for Free, Plus, and Pro.
-- W34 already enforces the exact monthly allowances: Free=5, Plus=50, Pro=300.
-- This migration removes the older Free/Plus-only plan checks left by W22.
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

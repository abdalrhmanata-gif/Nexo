-- W34: enforce exact monthly AI-generation allowances by plan.
-- Free: 5, Plus: 50, Pro: 300.
-- This migration is for the Development/release-candidate path only.
alter table public.ai_entitlements drop constraint if exists ai_entitlements_monthly_limit_check;
alter table public.ai_entitlements
  add constraint ai_entitlements_monthly_limit_check
  check ((plan = 'free' and monthly_limit = 5)
      or (plan = 'plus' and monthly_limit = 50)
      or (plan = 'pro' and monthly_limit = 300));

alter table public.ai_usage_monthly drop constraint if exists ai_usage_monthly_monthly_limit_check;
alter table public.ai_usage_monthly
  add constraint ai_usage_monthly_monthly_limit_check
  check ((plan = 'free' and monthly_limit = 5)
      or (plan = 'plus' and monthly_limit = 50)
      or (plan = 'pro' and monthly_limit = 300));

-- Normalize existing Plus rows to the new allowance.
update public.ai_entitlements set monthly_limit = 50 where plan = 'plus';
update public.ai_usage_monthly set monthly_limit = 50 where plan = 'plus';

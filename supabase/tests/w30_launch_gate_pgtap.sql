-- W30 launch-gate pgTAP assertions.
-- Run inside a transaction against disposable/Development PostgreSQL and roll back.
begin;
create extension if not exists pgtap;

select plan(21);

select ok(to_regclass('public.missions') is not null, 'missions exists');
select ok(to_regclass('public.mission_actions') is not null, 'mission_actions exists');
select ok(to_regclass('public.mission_events') is not null, 'mission_events exists');
select ok(to_regclass('public.mission_verifications') is not null, 'mission_verifications exists');
select ok(to_regclass('public.mission_outcomes') is not null, 'mission_outcomes exists');

select ok((select relrowsecurity from pg_class where oid='public.missions'::regclass), 'missions RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.mission_actions'::regclass), 'mission_actions RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.ai_usage_monthly'::regclass), 'ai_usage_monthly RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.ai_usage_reservations'::regclass), 'ai_usage_reservations RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.ai_entitlements'::regclass), 'ai_entitlements RLS enabled');

select ok(not has_table_privilege('anon','public.ai_usage_monthly','SELECT'), 'anon has no quota table SELECT');
select ok(not has_table_privilege('authenticated','public.ai_usage_monthly','SELECT'), 'authenticated has no direct quota table SELECT');

select ok(not has_function_privilege('anon','public.get_ai_usage()','EXECUTE'), 'anon cannot execute get_ai_usage');
select ok(has_function_privilege('authenticated','public.get_ai_usage()','EXECUTE'), 'authenticated can execute get_ai_usage');

select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='transition_mission'), 'transition_mission exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='transition_mission_action'), 'transition_mission_action exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='commit_verified_mission_outcome'), 'commit_verified_mission_outcome exists');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and coalesce(array_to_string(p.proconfig, '|'),'') not like '%search_path=pg_catalog, public%'
), 'all public SECURITY DEFINER functions pin search_path');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('anon',p.oid,'EXECUTE')
), 'no SECURITY DEFINER function is executable by anon');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and p.prosrc not like '%auth.uid()%'
    and p.proname <> 'guard_mission_action_insert'
), 'public SECURITY DEFINER runtime functions bind to auth.uid');

select ok(exists(select 1 from pg_constraint where conname='ai_usage_monthly_pkey'), 'monthly quota primary key exists');

select * from finish();
rollback;

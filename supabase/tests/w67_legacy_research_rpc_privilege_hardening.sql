-- W67: the legacy six-argument Research completion contract is not callable.
-- Full launch-gate replay ends at W79, where these overloads are removed; this
-- assertion also passes if a test targets the intermediate W67 state and they
-- remain present but have had all application-role EXECUTE grants revoked.
begin;
create extension if not exists pgtap;
select plan(6);

select ok(
  to_regprocedure('public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null
  or not has_function_privilege('anon',
    to_regprocedure('public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)'), 'EXECUTE'),
  'anonymous callers cannot execute the legacy public completion RPC');
select ok(
  to_regprocedure('public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null
  or not has_function_privilege('authenticated',
    to_regprocedure('public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)'), 'EXECUTE'),
  'authenticated callers cannot execute the legacy public completion RPC');
select ok(
  to_regprocedure('public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null
  or not has_function_privilege('service_role',
    to_regprocedure('public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)'), 'EXECUTE'),
  'trusted API callers cannot execute the legacy public completion RPC');

select ok(
  to_regprocedure('private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null
  or not has_function_privilege('anon',
    to_regprocedure('private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)'), 'EXECUTE'),
  'anonymous callers cannot execute the legacy private completion implementation');
select ok(
  to_regprocedure('private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null
  or not has_function_privilege('authenticated',
    to_regprocedure('private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)'), 'EXECUTE'),
  'authenticated callers cannot execute the legacy private SECURITY DEFINER implementation');
select ok(
  to_regprocedure('private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)') is null
  or not has_function_privilege('service_role',
    to_regprocedure('private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)'), 'EXECUTE'),
  'trusted API callers cannot execute the legacy private completion implementation');

select * from finish();
rollback;

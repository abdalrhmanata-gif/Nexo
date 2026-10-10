-- W30 launch-gate pgTAP assertions.
-- Run inside a transaction against disposable/Development PostgreSQL and roll back.
begin;
create extension if not exists pgtap;

select plan(37);

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
    and not exists (
      select 1 from pg_depend d join pg_extension e on e.oid=d.refobjid
      where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
    )
    and p.prosrc not like '%auth.uid()%'
    and p.proname not in (
      'guard_mission_action_insert','handle_new_user_profile',
      'prevent_mission_action_delete_with_history','prevent_action_delete_with_history',
      'prevent_mission_action_reparent'
    )
), 'public application SECURITY DEFINER runtime functions bind to auth.uid');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 'no public SECURITY DEFINER function is executable by authenticated');

select ok(
  pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)
    like '%EXECUTION_ALREADY_EXISTS%',
  'duplicate execution idempotency keys fail closed instead of authorizing a second provider dispatch'
);


do $w56_behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_first public.agent_executions;
  v_caught boolean := false;
  v_execution_count integer;
  v_key text := 'w56-duplicate-dispatch-guard-0001';
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W56 duplicate dispatch test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Prove duplicate execution is blocked', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (
    v_agent, v_workspace, 'W56 read-only test agent', 'Disposable duplicate-dispatch test agent',
    'ACTIVE', '{"mode":"read_only","requires_approval":false}'::jsonb, v_owner
  );

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select * into v_first
    from public.start_agent_execution(
      v_mission, null, v_agent, v_key,
      '{"type":"read_only_research","test":"w56_duplicate_guard"}'::jsonb
    );

  begin
    perform public.start_agent_execution(
      v_mission, null, v_agent, v_key,
      '{"type":"read_only_research","test":"w56_duplicate_guard"}'::jsonb
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_ALREADY_EXISTS' then
      v_caught := true;
    else
      raise;
    end if;
  end;

  if not v_caught then
    raise exception 'TEST_FAILED: duplicate idempotency key was returned as dispatch permission';
  end if;

  select count(*) into v_execution_count
    from public.agent_executions
   where workspace_id = v_workspace and idempotency_key = v_key;

  if v_execution_count <> 1 or v_first.id is null then
    raise exception 'TEST_FAILED: duplicate attempt created an additional execution row';
  end if;
end;
$w56_behavior$;

select pass('W56 rejects a duplicate execution key and preserves exactly one execution row');

select ok((
  select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'commit_verified_mission_outcome','consume_ai_generation','create_mission_verification',
    'create_mission_with_actions','get_ai_usage','release_ai_generation','reserve_ai_generation',
    'transition_mission','transition_mission_action','update_mission_details'
  ) and not p.prosecdef
) = 10, 'all application RPC boundaries are SECURITY INVOKER');

select ok((
  select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in (
    'commit_verified_mission_outcome','consume_ai_generation','create_mission_verification',
    'create_mission_with_actions','get_ai_usage','release_ai_generation','reserve_ai_generation',
    'transition_mission','transition_mission_action','update_mission_details'
  ) and p.prosecdef
) = 10, 'all privileged RPC implementations are SECURITY DEFINER in private');

select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot access private RPC schema');
select ok(exists(select 1 from pg_constraint where conname='ai_usage_monthly_pkey'), 'monthly quota primary key exists');
select ok(pg_get_functiondef('private.get_ai_usage()'::regprocedure) like '%coalesce(v_limit, 5)%', 'Free AI quota fallback is five');
select ok(pg_get_functiondef('private.reserve_ai_generation(text)'::regprocedure) like '%coalesce(v_limit, 5)%', 'reservation enforcement uses five for Free tier');
select ok(not has_table_privilege('anon','public.ai_entitlements','SELECT'), 'anon has no entitlement table SELECT');
select ok(not has_table_privilege('authenticated','public.ai_entitlements','SELECT'), 'authenticated has no direct entitlement table SELECT');

select ok(exists(
  select 1 from pg_constraint where conrelid='public.ai_entitlements'::regclass
    and conname='ai_entitlements_monthly_limit_check'
    and pg_get_constraintdef(oid) like '%monthly_limit = 5%'
    and pg_get_constraintdef(oid) like '%monthly_limit = 50%'
    and pg_get_constraintdef(oid) like '%monthly_limit = 300%'
), 'entitlement constraint enforces Free=5, Plus=50, Pro=300');

select ok(exists(
  select 1 from pg_constraint where conrelid='public.ai_usage_monthly'::regclass
    and conname='ai_usage_monthly_monthly_limit_check'
    and pg_get_constraintdef(oid) like '%monthly_limit = 5%'
    and pg_get_constraintdef(oid) like '%monthly_limit = 50%'
    and pg_get_constraintdef(oid) like '%monthly_limit = 300%'
), 'usage ledger constraint enforces Free=5, Plus=50, Pro=300');

select ok(not exists(
  select 1 from public.ai_entitlements where (plan='free' and monthly_limit<>5) or (plan='plus' and monthly_limit<>50) or (plan='pro' and monthly_limit<>300)
), 'all entitlement rows match plan allowance');
select ok(not exists(
  select 1 from public.ai_usage_monthly where (plan='free' and monthly_limit<>5) or (plan='plus' and monthly_limit<>50) or (plan='pro' and monthly_limit<>300)
), 'all usage ledger rows match plan allowance');

select ok(exists(
  select 1 from pg_constraint
  where conrelid='public.ai_entitlements'::regclass
    and conname='ai_entitlements_plan_check'
    and pg_get_constraintdef(oid) like '%free%'
    and pg_get_constraintdef(oid) like '%plus%'
    and pg_get_constraintdef(oid) like '%pro%'
), 'entitlements accept Free, Plus, and Pro plan identities');

select ok(exists(
  select 1 from pg_constraint
  where conrelid='public.ai_usage_monthly'::regclass
    and conname='ai_usage_monthly_plan_check'
    and pg_get_constraintdef(oid) like '%free%'
    and pg_get_constraintdef(oid) like '%plus%'
    and pg_get_constraintdef(oid) like '%pro%'
), 'usage ledger accepts Free, Plus, and Pro plan identities');

select * from finish();
rollback;

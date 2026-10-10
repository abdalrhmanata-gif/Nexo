-- W56: regression contract for duplicate agent-execution dispatch guards.
-- This is a schema/function-definition test, not proof of provider-side reconciliation.
begin;
create extension if not exists pgtap;
select plan(14);

select ok(to_regclass('public.agent_executions') is not null,
  'agent execution ledger exists');
select ok(to_regprocedure('public.start_agent_execution(uuid,uuid,uuid,text,jsonb)') is not null,
  'public start-execution wrapper exists');
select ok(to_regprocedure('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)') is not null,
  'private start-execution implementation exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure),
  'public wrapper is SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid = 'private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure),
  'private implementation is SECURITY DEFINER');
select ok(coalesce(array_to_string((select proconfig from pg_proc where oid = 'private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure), '|'), '')
  like '%search_path=pg_catalog, public%',
  'private implementation pins search_path');
select ok(not has_function_privilege('anon', 'public.start_agent_execution(uuid,uuid,uuid,text,jsonb)', 'EXECUTE'),
  'anonymous users cannot start executions');
select ok(has_function_privilege('authenticated', 'public.start_agent_execution(uuid,uuid,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated callers use the audited wrapper');

select ok(
  lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))
    like '%raise exception ''execution_already_exists''%'
  and lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))
    like '%execution_idempotency_binding_mismatch%',
  'a reused key is rejected and a mismatched binding is not reused');

select ok(
  position('if found then' in lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))) > 0
  and position(
    'raise exception ''execution_already_exists'''
    in split_part(
      split_part(lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)), 'if found then', 2),
      'v_requires_approval', 1
    )
  ) > 0
  and position(
    'return v_execution'
    in split_part(
      split_part(lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)), 'if found then', 2),
      'v_requires_approval', 1
    )
  ) = 0,
  'existing-execution branch fails closed instead of returning the old row as dispatch permission');

select ok(
  regexp_replace(
    lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)),
    '[[:space:]]+', '', 'g'
  ) like '%idempotency_key=p_idempotency_key%'
  and regexp_replace(
    lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)),
    '[[:space:]]+', '', 'g'
  ) like '%forupdate%'
  and regexp_replace(
    lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)),
    '[[:space:]]+', '', 'g'
  ) like '%insertintopublic.agent_executions%',
  'start path checks existing key under a lock before inserting a new attempt');

select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.agent_executions'::regclass
    and contype = 'u'
    and lower(pg_get_constraintdef(oid)) like '%(workspace_id, idempotency_key)%'
), 'database enforces workspace-scoped idempotency uniqueness');

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent_a uuid := gen_random_uuid();
  v_agent_b uuid := gen_random_uuid();
  v_first public.agent_executions;
  v_caught boolean := false;
  v_rows integer;
  v_start_events integer;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W56 duplicate dispatch test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Prove duplicate dispatch guard', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values
    (v_agent_a, v_workspace, 'W56 agent A', 'Disposable duplicate test agent', 'ACTIVE',
      '{"mode":"read_only","requires_approval":false}'::jsonb, v_owner),
    (v_agent_b, v_workspace, 'W56 agent B', 'Disposable binding test agent', 'ACTIVE',
      '{"mode":"read_only","requires_approval":false}'::jsonb, v_owner);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select * into v_first
    from public.start_agent_execution(
      v_mission, null, v_agent_a, 'w56-duplicate-dispatch-key-0001',
      '{"purpose":"first attempt"}'::jsonb
    );

  begin
    perform public.start_agent_execution(
      v_mission, null, v_agent_a, 'w56-duplicate-dispatch-key-0001',
      '{"purpose":"same attempt replay"}'::jsonb
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_ALREADY_EXISTS' then
      v_caught := true;
    else
      raise;
    end if;
  end;

  if not v_caught then
    raise exception 'TEST_FAILED: an exact duplicate key was not rejected as EXECUTION_ALREADY_EXISTS';
  end if;

  select count(*) into v_rows
    from public.agent_executions
   where workspace_id = v_workspace
     and idempotency_key = 'w56-duplicate-dispatch-key-0001';
  if v_rows <> 1 then
    raise exception 'TEST_FAILED: exact replay created % execution rows instead of one', v_rows;
  end if;

  select count(*) into v_start_events
    from public.mission_events
   where mission_id = v_mission
     and event_type = 'AGENT_EXECUTION_STARTED'
     and payload ->> 'idempotency_key' = 'w56-duplicate-dispatch-key-0001';
  if v_start_events <> 1 then
    raise exception 'TEST_FAILED: duplicate replay wrote % start events instead of one', v_start_events;
  end if;

  v_caught := false;
  begin
    perform public.start_agent_execution(
      v_mission, null, v_agent_b, 'w56-duplicate-dispatch-key-0001',
      '{"purpose":"attempt to rebind key to another agent"}'::jsonb
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' then
      v_caught := true;
    else
      raise;
    end if;
  end;

  if not v_caught then
    raise exception 'TEST_FAILED: idempotency key was not rejected when rebound to a different agent';
  end if;

  select count(*) into v_rows
    from public.agent_executions
   where workspace_id = v_workspace
     and idempotency_key = 'w56-duplicate-dispatch-key-0001';
  if v_rows <> 1 then
    raise exception 'TEST_FAILED: a mismatched binding created a second execution row';
  end if;
end;
$behavior$;

select pass('exact duplicate execution key is rejected without creating another row or start event');
select pass('an idempotency key cannot be rebound to a different agent');

select * from finish();
rollback;

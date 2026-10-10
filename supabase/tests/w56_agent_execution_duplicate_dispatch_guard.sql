-- W56: regression contract for duplicate agent-execution dispatch guards.
-- This is a schema/function-definition test, not proof of provider-side reconciliation.
begin;
create extension if not exists pgtap;
select plan(21);

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
  v_retry public.agent_executions;
  v_mission_row public.missions;
  v_approval public.mission_approvals;
  v_stale_approval public.mission_approvals;
  v_expired_approval public.mission_approvals;
  v_request jsonb;
  v_scope jsonb;
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
      '{"mode":"read_only","requires_approval":true,"revision":1}'::jsonb, v_owner),
    (v_agent_b, v_workspace, 'W56 agent B', 'Disposable binding test agent', 'ACTIVE',
      '{"mode":"read_only","requires_approval":true,"revision":1}'::jsonb, v_owner);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select * into v_mission_row from public.missions where id = v_mission;
  v_request := '{"destination":"test://w56","audience":"w56-test","purpose":"first attempt"}'::jsonb;
  v_scope := jsonb_build_object(
    'type', 'agent_execution',
    'schema_version', 1,
    'workspace_id', v_workspace,
    'mission_id', v_mission,
    'mission_version', v_mission_row.version,
    'action_id', null,
    'action_version', null,
    'agent_id', v_agent_a,
    'destination', 'test://w56',
    'audience', 'w56-test',
    'request_summary', 'W56 disposable bounded execution fixture',
    'expires_at', (clock_timestamp() + interval '20 minutes')::text,
    'request', v_request
  );
  select * into v_approval from public.request_mission_approval(v_mission, null, v_scope);
  perform public.decide_mission_approval(v_approval.id, 'APPROVED', 'W56 exact binding fixture');

  select * into v_first
    from public.start_agent_execution(
      v_mission, null, v_agent_a, 'w56-duplicate-dispatch-key-0001',
      v_request
    );

  begin
    perform public.start_agent_execution(
      v_mission, null, v_agent_a, 'w56-duplicate-dispatch-key-0001',
      '{"purpose":"first attempt"}'::jsonb
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
      v_mission, null, v_agent_a, 'w56-duplicate-dispatch-key-0001',
      '{"purpose":"changed input under same key"}'::jsonb
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' then
      v_caught := true;
    else
      raise;
    end if;
  end;

  if not v_caught then
    raise exception 'TEST_FAILED: idempotency key was not rejected when request contents changed';
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

  -- A new key cannot reuse the prior human approval with changed request content.
  v_caught := false;
  begin
    perform public.start_agent_execution(
      v_mission, null, v_agent_a, 'w56-changed-request-key-0002',
      '{"destination":"test://w56","audience":"w56-test","purpose":"changed request"}'::jsonb
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST_FAILED: changed request was accepted by a different idempotency key';
  end if;

  -- A scoped approval for agent A cannot authorize agent B.
  v_caught := false;
  begin
    perform public.start_agent_execution(
      v_mission, null, v_agent_b, 'w56-wrong-agent-key-0003', v_request
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST_FAILED: an approval bound to agent A authorized agent B';
  end if;

  -- A retry is permitted only within the original execution lineage and while
  -- the same exact approval binding remains unexpired.
  perform public.complete_agent_execution(
    v_first.id, 'FAILED', '{}'::jsonb, null, 'W56_TEST_FAILURE', 'Intentional fixture failure'
  );
  select * into v_retry
    from public.retry_agent_execution(v_first.id, 'w56-valid-retry-key-0006');
  if v_retry.retry_of_execution_id is distinct from v_first.id
     or v_retry.approval_id is distinct from v_first.approval_id
     or v_retry.request is distinct from v_first.request then
    raise exception 'TEST_FAILED: valid retry did not preserve approval, lineage, and exact request';
  end if;

  perform public.complete_agent_execution(
    v_retry.id, 'FAILED', '{}'::jsonb, null, 'W56_TEST_FAILURE', 'Intentional retry fixture failure'
  );
  update public.mission_approvals
     set expires_at = clock_timestamp() - interval '1 second'
   where id = v_approval.id;
  v_caught := false;
  begin
    perform public.retry_agent_execution(v_retry.id, 'w56-expired-retry-key-0007');
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST_FAILED: expired execution approval authorized a retry';
  end if;

  -- Approve the exact request, then mutate authority; the old approval must stop matching.
  v_scope := jsonb_build_object(
    'type', 'agent_execution', 'schema_version', 1,
    'workspace_id', v_workspace, 'mission_id', v_mission,
    'mission_version', v_mission_row.version,
    'action_id', null, 'action_version', null, 'agent_id', v_agent_a,
    'destination', 'test://w56', 'audience', 'w56-test',
    'request_summary', 'W56 disposable bounded execution fixture',
    'expires_at', (clock_timestamp() + interval '20 minutes')::text,
    'request', v_request
  );
  select * into v_stale_approval from public.request_mission_approval(v_mission, null, v_scope);
  perform public.decide_mission_approval(v_stale_approval.id, 'APPROVED', 'Will become stale');
  update public.workspace_agents
     set authority = '{"mode":"read_only","requires_approval":true,"revision":2}'::jsonb
   where id = v_agent_a;

  v_caught := false;
  begin
    perform public.start_agent_execution(
      v_mission, null, v_agent_a, 'w56-changed-authority-key-0004', v_request
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST_FAILED: an approval remained valid after agent authority changed';
  end if;

  -- Even a newly approved exact binding cannot execute after its database expiry.
  v_scope := jsonb_build_object(
    'type', 'agent_execution', 'schema_version', 1,
    'workspace_id', v_workspace, 'mission_id', v_mission,
    'mission_version', v_mission_row.version,
    'action_id', null, 'action_version', null, 'agent_id', v_agent_a,
    'destination', 'test://w56', 'audience', 'w56-test',
    'expires_at', (clock_timestamp() + interval '20 minutes')::text,
    'request', v_request
  );
  select * into v_expired_approval from public.request_mission_approval(v_mission, null, v_scope);
  perform public.decide_mission_approval(v_expired_approval.id, 'APPROVED', 'Will be expired by the test');
  update public.mission_approvals
     set expires_at = clock_timestamp() - interval '1 second'
   where id = v_expired_approval.id;

  v_caught := false;
  begin
    perform public.start_agent_execution(
      v_mission, null, v_agent_a, 'w56-expired-approval-key-0005', v_request
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED' then v_caught := true; else raise; end if;
  end;
  if not v_caught then
    raise exception 'TEST_FAILED: an expired approval authorized execution';
  end if;

  select count(*) into v_rows
    from public.agent_executions
   where workspace_id = v_workspace and mission_id = v_mission;
  if v_rows <> 2 then
    raise exception 'TEST_FAILED: blocked approval-binding requests created extra execution rows or valid retry was missing';
  end if;
end;
$behavior$;

select pass('exact unexpired request-bound approval permits one execution');
select pass('exact same-request retry remains inside the original execution lineage');
select pass('expired execution approval cannot authorize a retry');
select pass('exact duplicate execution key is rejected without another row or start event');
select pass('changed request content cannot reuse an execution approval or idempotency key');
select pass('an approval bound to one agent cannot authorize another agent');
select pass('agent authority changes invalidate previously approved execution bindings');
select pass('expired execution approvals are rejected before creating an execution row');
select pass('an idempotency key cannot be rebound to a different agent');

select * from finish();
rollback;

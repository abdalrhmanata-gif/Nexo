-- W50: behavioral proof that an expired lease cannot be revived.
begin;
create extension if not exists pgtap;
select plan(5);

select ok(to_regprocedure('private.heartbeat_agent_execution(uuid)') is not null,
  'private heartbeat implementation exists');
select ok(to_regprocedure('public.heartbeat_agent_execution(uuid)') is not null
  and not (select prosecdef from pg_proc where oid = 'public.heartbeat_agent_execution(uuid)'::regprocedure),
  'public heartbeat wrapper exists and remains SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid = 'private.heartbeat_agent_execution(uuid)'::regprocedure)
  and coalesce(array_to_string((select proconfig from pg_proc where oid = 'private.heartbeat_agent_execution(uuid)'::regprocedure), '|'), '')
    like '%search_path=pg_catalog, public%',
  'private heartbeat implementation is SECURITY DEFINER with pinned search_path');
select ok(has_function_privilege('authenticated', 'public.heartbeat_agent_execution(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.heartbeat_agent_execution(uuid)', 'EXECUTE'),
  'only authenticated callers receive the public heartbeat RPC');

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_execution_id uuid := gen_random_uuid();
  v_before public.agent_executions;
  v_after public.agent_executions;
  v_caught boolean := false;
begin
  -- Create all fixtures in this disposable test transaction.
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W50 lease fence test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Verify expired lease fencing', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (
    v_agent, v_workspace, 'W50 read-only test agent', 'Disposable recovery test agent',
    'ACTIVE', '{"mode":"read_only","requires_approval":false}'::jsonb, v_owner
  );
  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, heartbeat_at, lease_expires_at, attempt_number
  )
  values (
    v_execution_id, v_workspace, v_mission, v_agent, v_owner,
    'w50-expired-lease-execution-0001', 'RUNNING',
    '{"mode":"read_only","requires_approval":false}'::jsonb,
    '{"purpose":"prove an expired lease cannot be revived"}'::jsonb,
    now() - interval '6 minutes', now() - interval '1 minute', 1
  );

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select * into v_before from public.agent_executions where id = v_execution_id;
  begin
    perform public.heartbeat_agent_execution(v_execution_id);
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_LEASE_EXPIRED' then
      v_caught := true;
    else
      raise;
    end if;
  end;

  if not v_caught then
    raise exception 'TEST_FAILED: heartbeat unexpectedly revived an expired lease';
  end if;

  select * into v_after from public.agent_executions where id = v_execution_id;
  if v_after.status <> 'RUNNING'
     or v_after.heartbeat_at is distinct from v_before.heartbeat_at
     or v_after.lease_expires_at is distinct from v_before.lease_expires_at then
    raise exception 'TEST_FAILED: rejected heartbeat changed execution state';
  end if;

  -- The owner can reconcile the expired execution, but it becomes UNKNOWN,
  -- carries explicit non-retryable evidence, and is not blindly retried.
  select * into v_after from public.reconcile_stale_agent_execution(v_execution_id);
  if v_after.status <> 'UNKNOWN'
     or v_after.evidence ->> 'outcome' <> 'unknown'
     or v_after.evidence ->> 'safe_to_retry' <> 'false'
     or v_after.reconciled_at is null then
    raise exception 'TEST_FAILED: stale execution was not reconciled safely';
  end if;

  if not exists (
    select 1 from public.mission_events
    where mission_id = v_mission
      and event_type = 'AGENT_EXECUTION_RECONCILED'
      and payload ->> 'execution_id' = v_execution_id::text
      and payload ->> 'safe_to_retry' = 'false'
  ) then
    raise exception 'TEST_FAILED: reconciliation evidence was not recorded in mission history';
  end if;

  v_caught := false;
  begin
    perform public.retry_agent_execution(v_execution_id, 'w50-unknown-retry-request-0001');
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_OUTCOME_UNKNOWN_NOT_RETRYABLE' then
      v_caught := true;
    else
      raise;
    end if;
  end;
  if not v_caught then
    raise exception 'TEST_FAILED: UNKNOWN execution was allowed to retry without reconciliation';
  end if;
end;
$behavior$;

select pass('expired heartbeat is fenced; reconciliation records UNKNOWN and blind retry is rejected');
select * from finish();
rollback;

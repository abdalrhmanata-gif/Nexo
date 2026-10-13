-- W69: every delegated external side effect needs a single-use server JIT claim.
begin;
create extension if not exists pgtap;
select plan(22);

select ok(
  (select count(*) = 4 from information_schema.columns
    where table_schema = 'public' and table_name = 'agent_executions'
      and column_name in ('dispatch_claimed_at','dispatch_claim_authority_hash','dispatch_claim_request_hash','dispatch_claim_budget_revision')),
  'the execution ledger stores the one-time dispatch claim and scope hashes');
select ok(to_regprocedure('public.claim_agent_execution_dispatch(uuid)') is not null,
  'public JIT dispatch-claim wrapper exists');
select ok(to_regprocedure('private.claim_agent_execution_dispatch(uuid)') is not null,
  'private JIT dispatch-claim implementation exists');
select ok(not has_function_privilege('authenticated',
  'public.claim_agent_execution_dispatch(uuid)', 'EXECUTE'),
  'authenticated users cannot mint a dispatch claim');
select ok(not has_function_privilege('authenticated',
  'private.claim_agent_execution_dispatch(uuid)', 'EXECUTE'),
  'authenticated users cannot invoke the private dispatch-claim implementation');
select ok(not has_function_privilege('anon',
  'public.claim_agent_execution_dispatch(uuid)', 'EXECUTE'),
  'anonymous users cannot mint a dispatch claim');
select ok(has_function_privilege('service_role',
  'public.claim_agent_execution_dispatch(uuid)', 'EXECUTE'),
  'the trusted server worker can claim dispatch through the public wrapper');
select ok(has_function_privilege('service_role',
  'private.claim_agent_execution_dispatch(uuid)', 'EXECUTE'),
  'the trusted server worker can invoke the guarded private function');
select ok(not (select prosecdef from pg_proc where oid = 'public.claim_agent_execution_dispatch(uuid)'::regprocedure),
  'the public wrapper is SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid = 'private.claim_agent_execution_dispatch(uuid)'::regprocedure)
  and coalesce(array_to_string((select proconfig from pg_proc where oid = 'private.claim_agent_execution_dispatch(uuid)'::regprocedure), '|'), '')
    like '%search_path=pg_catalog, public, private, extensions%',
  'the private JIT gate is SECURITY DEFINER with a pinned search_path');
select ok(
  lower(pg_get_functiondef('private.claim_agent_execution_dispatch(uuid)'::regprocedure)) like '%dispatch_claimed_at is null%'
  and lower(pg_get_functiondef('private.claim_agent_execution_dispatch(uuid)'::regprocedure)) like '%authority_budget_revision%'
  and lower(pg_get_functiondef('private.claim_agent_execution_dispatch(uuid)'::regprocedure)) like '%lease_expires_at%'
  and lower(pg_get_functiondef('private.claim_agent_execution_dispatch(uuid)'::regprocedure)) like '%requested_scope - ''expires_at''%',
  'the JIT gate revalidates one-time claim, budget revision, lease and exact approved scope');
select ok(
  lower(pg_get_functiondef('private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%dispatch_claim_required%'
  and lower(pg_get_functiondef('private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)'::regprocedure))
    like '%provider_not_sent%',
  'trusted completion requires a dispatch claim unless trusted evidence proves no send before dispatch');
select ok(
  position('v_now := clock_timestamp()' in lower(pg_get_functiondef('private.claim_agent_execution_dispatch(uuid)'::regprocedure)))
    > position('from public.mission_approvals a' in lower(pg_get_functiondef('private.claim_agent_execution_dispatch(uuid)'::regprocedure)))
  and lower(pg_get_functiondef('private.claim_agent_execution_dispatch(uuid)'::regprocedure))
    like '%approval_expired_requires_reapproval%',
  'the final clock sample and expiry check happen after the approval row lock');

create temporary table w69_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;
create temporary table w69_cross_tenant_fixture (
  attacker_id uuid not null,
  mission_id uuid not null,
  action_id uuid not null,
  agent_id uuid not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_actions uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_execution_ids uuid[] := array[null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid];
  v_budget jsonb;
  v_budget_id uuid;
  v_revision bigint;
  v_approval public.mission_approvals;
  v_execution public.agent_executions;
  v_claim public.agent_executions;
  v_request jsonb;
  v_scope jsonb;
  v_caught boolean;
  v_claim_event_count integer;
  v_mission_version bigint;
  v_action_version bigint;
  i integer;
begin
  insert into auth.users(id) values (v_owner), (v_attacker);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W69 dispatch claim test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Prove one-time JIT dispatch claim', 'READY');

  -- The action guard intentionally requires an authenticated workspace editor.
  -- Establish the disposable test identity before inserting the actions.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  insert into public.mission_actions(id, mission_id, title, position, status)
  select v_actions[seq.idx], v_mission, 'W69 action ' || seq.idx, seq.idx - 1, 'PENDING'
    from generate_subscripts(v_actions, 1) as seq(idx);
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values (v_agent, v_workspace, 'W69 bounded side-effect agent', 'Disposable JIT claim test', 'ACTIVE',
    '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb, v_owner);

  select version into v_mission_version from public.missions where id = v_mission;
  select version into v_action_version from public.mission_actions where id = v_actions[6];

  insert into w69_cross_tenant_fixture values (v_attacker, v_mission, v_actions[1], v_agent);

  v_budget := public.configure_mission_authority_budget(
    v_workspace, v_mission, v_agent, 6, 60, 10, 'USD',
    clock_timestamp() + interval '1 hour',
    clock_timestamp() - interval '1 minute'
  );
  v_budget_id := (v_budget ->> 'id')::uuid;
  v_revision := (v_budget ->> 'authority_revision')::bigint;

  for i in 1..6 loop
    v_request := jsonb_build_object(
      'authority_budget_revision', v_revision,
      'destination', 'https://example.invalid/w69/action-' || i,
      'audience', 'w69-provider-v1',
      'summary', 'Perform the exact approved bounded test action ' || i,
      'payload', jsonb_build_object('operation', 'action-' || i, 'quantity', 1)
    );
    v_scope := jsonb_build_object(
      'schema_version', 1,
      'type', 'agent_execution_binding_v1',
      'agent_id', v_agent,
      'request', v_request
    );
    select * into v_approval
      from public.request_mission_approval(v_mission, v_actions[i], v_scope);
    select * into v_approval
      from public.decide_mission_approval(v_approval.id, 'APPROVED', null);
    select * into v_execution
      from public.start_agent_execution(
        v_mission, v_actions[i], v_agent,
        'w69-dispatch-attempt-key-' || lpad(i::text, 2, '0'),
        v_request
      );
    v_execution_ids[i] := v_execution.id;
  end loop;

  v_caught := false;
  begin
    perform public.claim_agent_execution_dispatch(v_execution_ids[1]);
  exception when sqlstate '42501' then
    if sqlerrm = 'TRUSTED_EXECUTOR_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w69_behavior_results values ('authenticated_claim_denied', v_caught);

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);

  select * into v_claim from public.claim_agent_execution_dispatch(v_execution_ids[1]);
  select count(*) into v_claim_event_count
    from public.mission_events
   where mission_id = v_mission
     and event_type = 'AGENT_EXECUTION_DISPATCH_CLAIMED'
     and payload ->> 'execution_id' = v_execution_ids[1]::text;
  insert into w69_behavior_results values ('first_exact_claim_succeeds',
    v_claim.id = v_execution_ids[1]
    and v_claim.dispatch_claimed_at is not null
    and v_claim.dispatch_claim_authority_hash ~ '^[0-9a-f]{64}$'
    and v_claim.dispatch_claim_request_hash ~ '^[0-9a-f]{64}$'
    and v_claim.dispatch_claim_budget_revision = v_revision
    and v_claim_event_count = 1);

  v_caught := false;
  begin
    perform public.claim_agent_execution_dispatch(v_execution_ids[1]);
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH' then v_caught := true; else raise; end if;
  end;
  insert into w69_behavior_results values ('same_execution_cannot_claim_twice', v_caught);

  -- Dedicated, still-authorized executions isolate stale-version tests from
  -- the later budget-revocation and authority-change tests.
  update public.missions set version = v_mission_version + 1 where id = v_mission;
  v_caught := false;
  begin
    perform public.claim_agent_execution_dispatch(v_execution_ids[5]);
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED_OR_SCOPE_CHANGED' then v_caught := true; else raise; end if;
  end;
  insert into w69_behavior_results values ('stale_mission_version_denied', v_caught);
  update public.missions set version = v_mission_version where id = v_mission;

  update public.mission_actions set version = v_action_version + 1 where id = v_actions[6];
  v_caught := false;
  begin
    perform public.claim_agent_execution_dispatch(v_execution_ids[6]);
  exception when sqlstate '42501' then
    if sqlerrm = 'APPROVAL_REQUIRED_OR_SCOPE_CHANGED' then v_caught := true; else raise; end if;
  end;
  insert into w69_behavior_results values ('stale_action_version_denied', v_caught);
  update public.mission_actions set version = v_action_version where id = v_actions[6];

  update public.agent_executions
     set lease_expires_at = clock_timestamp() - interval '1 second'
   where id = v_execution_ids[2];
  v_caught := false;
  begin
    perform public.claim_agent_execution_dispatch(v_execution_ids[2]);
  exception when sqlstate '22023' then
    if sqlerrm = 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' then v_caught := true; else raise; end if;
  end;
  insert into w69_behavior_results values ('expired_lease_denied', v_caught);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.revoke_mission_authority_budget(v_budget_id);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);
  v_caught := false;
  begin
    perform public.claim_agent_execution_dispatch(v_execution_ids[4]);
  exception when sqlstate '42501' then
    if sqlerrm = 'AUTHORITY_BUDGET_MISSING_OR_INACTIVE' then v_caught := true; else raise; end if;
  end;
  insert into w69_behavior_results values ('revoked_budget_denied', v_caught);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  update public.workspace_agents
     set authority = authority || '{"changed_after_start":true}'::jsonb
   where id = v_agent;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'service_role')::text, true);
  v_caught := false;
  begin
    perform public.claim_agent_execution_dispatch(v_execution_ids[3]);
  exception when sqlstate '22023' then
    if sqlerrm = 'AGENT_AUTHORITY_CHANGED' then v_caught := true; else raise; end if;
  end;
  insert into w69_behavior_results values ('changed_authority_denied', v_caught);


end;
$behavior$;

-- Change JWT identity between SQL statements so auth.uid() is evaluated for the outsider.
select set_config('request.jwt.claim.sub', attacker_id::text, true)
  from w69_cross_tenant_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims',
  jsonb_build_object('sub', attacker_id, 'role', 'authenticated')::text, true)
  from w69_cross_tenant_fixture;
do $cross_tenant$
declare
  v_fixture w69_cross_tenant_fixture%rowtype;
  v_caught boolean := false;
begin
  select * into v_fixture from w69_cross_tenant_fixture;
  if auth.uid() is distinct from v_fixture.attacker_id then
    raise exception 'TEST_IDENTITY_MISMATCH: attacker JWT did not resolve to the attacker';
  end if;

  -- Match a real authenticated PostgREST request, not only its claim settings.
  perform set_config('role', 'authenticated', true);
  if auth.uid() is distinct from v_fixture.attacker_id
     or private.can_edit_workspace(
       (select workspace_id from public.missions where id = v_fixture.mission_id),
       v_fixture.attacker_id
     ) then
    raise exception 'TEST_IDENTITY_OR_AUTHORIZATION_MISMATCH';
  end if;
  begin
    perform public.start_agent_execution(
      v_fixture.mission_id, v_fixture.action_id, v_fixture.agent_id,
      'w69-cross-tenant-denial-key-01',
      '{"destination":"https://example.invalid/denied","audience":"w69-test"}'::jsonb
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'MISSION_NOT_FOUND_OR_FORBIDDEN' then v_caught := true; else raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  insert into w69_behavior_results values ('cross_tenant_start_denied', v_caught);
end;
$cross_tenant$;

select ok((select passed from w69_behavior_results where name = 'cross_tenant_start_denied'),
  'an authenticated user outside the workspace cannot start or discover its mission execution');
select ok((select passed from w69_behavior_results where name = 'authenticated_claim_denied'),
  'an authenticated workspace owner cannot mint a dispatch claim');
select ok((select passed from w69_behavior_results where name = 'first_exact_claim_succeeds'),
  'the first claim records authority, request and budget revisions with one audit event');
select ok((select passed from w69_behavior_results where name = 'same_execution_cannot_claim_twice'),
  'the same execution cannot receive a second dispatch claim');
select ok((select passed from w69_behavior_results where name = 'expired_lease_denied'),
  'an expired worker lease cannot pass the just-in-time gate');
select ok((select passed from w69_behavior_results where name = 'revoked_budget_denied'),
  'a budget revoked after start cannot pass the just-in-time gate');
select ok((select passed from w69_behavior_results where name = 'changed_authority_denied'),
  'an authority change after start invalidates the dispatch claim');
select ok((select passed from w69_behavior_results where name = 'stale_mission_version_denied'),
  'a mission version change after start invalidates the JIT claim');
select ok((select passed from w69_behavior_results where name = 'stale_action_version_denied'),
  'an action version change after start invalidates the JIT claim');

select * from finish();
rollback;

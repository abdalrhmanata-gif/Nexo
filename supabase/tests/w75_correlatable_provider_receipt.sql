-- W75: external-side-effect success needs a top-level stable provider reference.
-- Generic status/provider metadata and nested IDs are not reconciliation keys.
begin;
create extension if not exists pgtap;
select plan(10);

select ok(exists (
  select 1 from pg_trigger
   where tgrelid = 'public.agent_executions'::regclass
     and tgname = 'agent_execution_success_receipt_guard'
     and not tgisinternal
), 'external execution success receipt guard is attached');

select ok(
  (select prosecdef from pg_proc where oid = 'private.guard_external_execution_success_receipt()'::regprocedure)
  and coalesce(array_to_string(
    (select proconfig from pg_proc where oid = 'private.guard_external_execution_success_receipt()'::regprocedure), '|'
  ), '') like '%search_path=pg_catalog, public%',
  'receipt guard is SECURITY DEFINER with a pinned search_path');

select ok(not has_function_privilege('authenticated',
  'private.guard_external_execution_success_receipt()', 'EXECUTE'),
  'authenticated callers cannot invoke the internal trigger function directly');

select ok(
  position('EXTERNAL_SUCCESS_PROVIDER_REFERENCE_REQUIRED' in
    pg_get_functiondef('private.guard_external_execution_success_receipt()'::regprocedure)) > 0
  and position('external_side_effects' in
    pg_get_functiondef('private.guard_external_execution_success_receipt()'::regprocedure)) > 0,
  'guard is restricted to external-side-effect successes and fails closed');

create temporary table w75_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_action uuid := gen_random_uuid();
  v_side_agent uuid := gen_random_uuid();
  v_research_agent uuid := gen_random_uuid();
  v_ids uuid[] := array[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ];
  v_caught boolean;
  v_rows integer;
  v_side_authority jsonb := '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb;
  v_research_authority jsonb := '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W75 correlatable provider receipt');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Require durable provider correlation before external success', 'READY');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  insert into public.mission_actions(id, mission_id, title, position, status)
  values (v_action, v_mission, 'W75 receipt correlation action', 0, 'PENDING');

  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values
    (v_side_agent, v_workspace, 'W75 side-effect fixture', 'Disposable trigger-only test agent', 'ACTIVE', v_side_authority, v_owner),
    (v_research_agent, v_workspace, 'W75 research fixture', 'Read-only control test agent', 'ACTIVE', v_research_authority, v_owner);

  insert into public.agent_executions(
    id, workspace_id, mission_id, action_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request
  ) values
    (v_ids[1], v_workspace, v_mission, v_action, v_side_agent, v_owner, 'w75-status-only-key-0001', 'RUNNING',
      v_side_authority, '{"destination":"https://example.invalid/w75/status","audience":"w75.fake.v1"}'::jsonb),
    (v_ids[2], v_workspace, v_mission, v_action, v_side_agent, v_owner, 'w75-provider-only-key-0001', 'RUNNING',
      v_side_authority, '{"destination":"https://example.invalid/w75/provider","audience":"w75.fake.v1"}'::jsonb),
    (v_ids[3], v_workspace, v_mission, v_action, v_side_agent, v_owner, 'w75-nested-id-key-0001', 'RUNNING',
      v_side_authority, '{"destination":"https://example.invalid/w75/nested","audience":"w75.fake.v1"}'::jsonb),
    (v_ids[4], v_workspace, v_mission, v_action, v_side_agent, v_owner, 'w75-string-id-key-0001', 'RUNNING',
      v_side_authority, '{"destination":"https://example.invalid/w75/string","audience":"w75.fake.v1"}'::jsonb),
    (v_ids[5], v_workspace, v_mission, v_action, v_side_agent, v_owner, 'w75-numeric-id-key-0001', 'RUNNING',
      v_side_authority, '{"destination":"https://example.invalid/w75/numeric","audience":"w75.fake.v1"}'::jsonb),
    (v_ids[6], v_workspace, v_mission, null, v_research_agent, v_owner, 'w75-read-only-key-0001', 'RUNNING',
      v_research_authority, '{"type":"read_only_research","request_id":"w75-read-only-request"}'::jsonb);

  v_caught := false;
  begin
    update public.agent_executions
       set status = 'SUCCEEDED',
           evidence = '{"provider_receipt":{"status":"ok"}}'::jsonb
     where id = v_ids[1];
  exception when sqlstate '22023' then
    if sqlerrm = 'EXTERNAL_SUCCESS_PROVIDER_REFERENCE_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w75_behavior_results values ('status_only_receipt_rejected', v_caught);

  v_caught := false;
  begin
    update public.agent_executions
       set status = 'SUCCEEDED',
           evidence = '{"provider_receipt":{"provider":"resend"}}'::jsonb
     where id = v_ids[2];
  exception when sqlstate '22023' then
    if sqlerrm = 'EXTERNAL_SUCCESS_PROVIDER_REFERENCE_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w75_behavior_results values ('provider_only_receipt_rejected', v_caught);

  v_caught := false;
  begin
    update public.agent_executions
       set status = 'SUCCEEDED',
           evidence = '{"provider_receipt":{"reference":{"id":"nested-ref"}}}'::jsonb
     where id = v_ids[3];
  exception when sqlstate '22023' then
    if sqlerrm = 'EXTERNAL_SUCCESS_PROVIDER_REFERENCE_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w75_behavior_results values ('nested_reference_rejected', v_caught);

  update public.agent_executions
     set status = 'SUCCEEDED',
         evidence = '{"provider_receipt":{"provider":"w75-test","id":"stable-receipt-1"}}'::jsonb
   where id = v_ids[4];
  get diagnostics v_rows = row_count;
  insert into w75_behavior_results values ('stable_string_reference_accepted', v_rows = 1);

  update public.agent_executions
     set status = 'SUCCEEDED',
         evidence = '{"provider_receipt":{"operation_id":12345}}'::jsonb
   where id = v_ids[5];
  get diagnostics v_rows = row_count;
  insert into w75_behavior_results values ('stable_numeric_reference_accepted', v_rows = 1);

  -- Read-only research is intentionally exempt from provider-side-effect receipt rules.
  update public.agent_executions
     set status = 'SUCCEEDED',
         evidence = '{"outcome":"SUCCEEDED","verified":false}'::jsonb
   where id = v_ids[6];
  get diagnostics v_rows = row_count;
  insert into w75_behavior_results values ('read_only_research_path_unaffected', v_rows = 1);
end;
$behavior$;

select ok((select passed from w75_behavior_results where name = 'status_only_receipt_rejected'),
  'a success status without a provider reference is rejected');
select ok((select passed from w75_behavior_results where name = 'provider_only_receipt_rejected'),
  'provider name alone is not a reconciliation key');
select ok((select passed from w75_behavior_results where name = 'nested_reference_rejected'),
  'a nested identifier is not accepted as a top-level provider reference');
select ok((select passed from w75_behavior_results where name = 'stable_string_reference_accepted'),
  'a stable top-level string receipt reference allows external success');
select ok((select passed from w75_behavior_results where name = 'stable_numeric_reference_accepted'),
  'a stable top-level numeric receipt reference allows external success');
select ok((select passed from w75_behavior_results where name = 'read_only_research_path_unaffected'),
  'read-only research success is not subjected to external side-effect receipt correlation');

select * from finish();
rollback;

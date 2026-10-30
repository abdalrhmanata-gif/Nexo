-- W76: the external success receipt guard cannot be bypassed via INSERT.
begin;
create extension if not exists pgtap;
select plan(8);

select ok(exists (
  select 1 from pg_trigger
   where tgrelid = 'public.agent_executions'::regclass
     and tgname = 'agent_execution_success_receipt_guard'
     and not tgisinternal
), 'correlatable provider receipt guard is attached');

select ok(position('INSERT' in upper(pg_get_triggerdef((
  select oid from pg_trigger
   where tgrelid = 'public.agent_executions'::regclass
     and tgname = 'agent_execution_success_receipt_guard'
     and not tgisinternal
)))) > 0, 'receipt guard fires before INSERT');

select ok(position('UPDATE' in upper(pg_get_triggerdef((
  select oid from pg_trigger
   where tgrelid = 'public.agent_executions'::regclass
     and tgname = 'agent_execution_success_receipt_guard'
     and not tgisinternal
)))) > 0, 'receipt guard continues to fire before UPDATE');

select ok(not has_function_privilege('authenticated',
  'private.guard_external_execution_success_receipt()', 'EXECUTE'),
  'authenticated callers cannot execute the internal receipt guard directly');

create temporary table w76_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_side_agent uuid := gen_random_uuid();
  v_research_agent uuid := gen_random_uuid();
  v_bad_insert_blocked boolean := false;
  v_update_blocked boolean := false;
  v_valid_insert uuid := gen_random_uuid();
  v_research_insert uuid := gen_random_uuid();
  v_update_execution uuid := gen_random_uuid();
  v_rows integer;
  v_side_authority jsonb := '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb;
  v_research_authority jsonb := '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W76 external success insert guard');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Guard external success during insert and update', 'READY');
  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values
    (v_side_agent, v_workspace, 'W76 external-side-effect fixture', 'Disposable trigger fixture', 'ACTIVE', v_side_authority, v_owner),
    (v_research_agent, v_workspace, 'W76 read-only fixture', 'Read-only trigger control', 'ACTIVE', v_research_authority, v_owner);

  begin
    insert into public.agent_executions(
      workspace_id, mission_id, agent_id, requested_by, idempotency_key,
      status, authority_snapshot, request, evidence, completed_at
    ) values (
      v_workspace, v_mission, v_side_agent, v_owner, 'w76-invalid-insert-key-0001',
      'SUCCEEDED', v_side_authority,
      '{"destination":"https://example.invalid/w76/insert","audience":"w76.fake.v1"}'::jsonb,
      '{"provider_receipt":{"status":"ok"}}'::jsonb, clock_timestamp()
    );
  exception when sqlstate '22023' then
    if sqlerrm = 'EXTERNAL_SUCCESS_PROVIDER_REFERENCE_REQUIRED' then
      v_bad_insert_blocked := true;
    else
      raise;
    end if;
  end;
  insert into w76_behavior_results values ('invalid_external_success_insert_blocked', v_bad_insert_blocked);

  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, evidence, completed_at
  ) values (
    v_valid_insert, v_workspace, v_mission, v_side_agent, v_owner, 'w76-valid-insert-key-0001',
    'SUCCEEDED', v_side_authority,
    '{"destination":"https://example.invalid/w76/insert-valid","audience":"w76.fake.v1"}'::jsonb,
    '{"provider_receipt":{"id":"w76-valid-receipt"}}'::jsonb, clock_timestamp()
  );
  select count(*) into v_rows from public.agent_executions where id = v_valid_insert and status = 'SUCCEEDED';
  insert into w76_behavior_results values ('correlatable_external_success_insert_allowed', v_rows = 1);

  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, evidence, completed_at
  ) values (
    v_research_insert, v_workspace, v_mission, v_research_agent, v_owner, 'w76-research-insert-key-0001',
    'SUCCEEDED', v_research_authority,
    '{"type":"read_only_research"}'::jsonb,
    '{"outcome":"SUCCEEDED","verified":false}'::jsonb, clock_timestamp()
  );
  select count(*) into v_rows from public.agent_executions where id = v_research_insert and status = 'SUCCEEDED';
  insert into w76_behavior_results values ('read_only_success_insert_unaffected', v_rows = 1);

  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request
  ) values (
    v_update_execution, v_workspace, v_mission, v_side_agent, v_owner, 'w76-invalid-update-key-0001',
    'RUNNING', v_side_authority,
    '{"destination":"https://example.invalid/w76/update","audience":"w76.fake.v1"}'::jsonb
  );

  begin
    update public.agent_executions
       set status = 'SUCCEEDED',
           evidence = '{"provider_receipt":{"status":"ok"}}'::jsonb,
           completed_at = clock_timestamp()
     where id = v_update_execution;
  exception when sqlstate '22023' then
    if sqlerrm = 'EXTERNAL_SUCCESS_PROVIDER_REFERENCE_REQUIRED' then
      v_update_blocked := true;
    else
      raise;
    end if;
  end;
  insert into w76_behavior_results values ('invalid_external_success_update_still_blocked', v_update_blocked);
end;
$behavior$;

select ok((select passed from w76_behavior_results where name = 'invalid_external_success_insert_blocked'),
  'unreferenced external SUCCEEDED rows cannot be inserted');
select ok((select passed from w76_behavior_results where name = 'correlatable_external_success_insert_allowed'),
  'an external SUCCEEDED row with a stable provider reference can be inserted');
select ok((select passed from w76_behavior_results where name = 'read_only_success_insert_unaffected'),
  'read-only success remains exempt from provider-side-effect receipt rules');
select ok((select passed from w76_behavior_results where name = 'invalid_external_success_update_still_blocked'),
  'the same rule still rejects an unreferenced external SUCCEEDED update');

select * from finish();
rollback;

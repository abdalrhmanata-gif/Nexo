-- W73: service-role lifecycle events are tightly scoped SYSTEM events and
-- the legacy user path still records real users, not a null authenticated actor.
begin;
create extension if not exists pgtap;
select plan(26);

select ok(to_regprocedure('private.record_mission_event(uuid,text,jsonb)') is not null,
  'private mission-event writer exists');
select ok((select prosecdef from pg_proc where oid = 'private.record_mission_event(uuid,text,jsonb)'::regprocedure),
  'mission-event writer is SECURITY DEFINER');
select ok(coalesce(array_to_string((select proconfig from pg_proc where oid = 'private.record_mission_event(uuid,text,jsonb)'::regprocedure), '|'), '')
  like '%search_path=pg_catalog, public, private%',
  'mission-event writer pins its search_path');
select ok(position('auth.role()' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0
  and position('service_role' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'system-event handling requires the trusted JWT role');
select ok(
  position('AGENT_EXECUTION_DISPATCH_CLAIMED' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0
  and position('AGENT_EXECUTION_COMPLETED' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'dispatch and completion system events are explicitly allowlisted');
select ok(
  position('AGENT_EXECUTION_RECONCILIATION_CLAIMED' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0
  and position('AGENT_EXECUTION_OUTCOME_RECONCILED' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0
  and position('AGENT_EXECUTION_RECONCILED' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'reconciliation system event types are explicitly allowlisted');
select ok(position('e.mission_id = p_mission_id' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'system events bind the execution to the exact mission');
select ok(
  position('dispatch_claim_request_hash' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0
  and position('dispatch_claim_budget_revision' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0
  and position('dispatch_claimed_at' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'dispatch events must match a persisted one-time claim');
select ok(
  position('v_execution.completed_at is null' in lower(pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure))) > 0
  and position('v_payload ->> ''status'' is distinct from v_execution.status' in lower(pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure))) > 0,
  'completion events must match a finalized execution row');
select ok(
  position('reconciliation_claim_token is null' in lower(pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure))) > 0
  and position('reconciliation_claimed_at is null' in lower(pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure))) > 0,
  'reconciliation events check the claimed lease and completed reconciliation state');
select ok(position('private.can_edit_workspace' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'user events require an owner or workspace editor');
select ok(
  position('read_only_research' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0
  and position('external_side_effects' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'user-attributed completion events are restricted to the W64 read-only path');
select ok(
  position('execution_lease_expired' in lower(pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure))) > 0
  and position('budget_reservation_status' in pg_get_functiondef('private.record_mission_event(uuid,text,jsonb)'::regprocedure)) > 0,
  'authenticated stale-recovery events remain bound to W71 evidence and held budget');
select ok(has_function_privilege('authenticated', 'public.record_mission_event(uuid,text,jsonb)', 'EXECUTE'),
  'authenticated users retain the audited public wrapper');
select ok(not has_function_privilege('anon', 'public.record_mission_event(uuid,text,jsonb)', 'EXECUTE'),
  'anonymous users cannot append mission history');
select ok(not has_function_privilege('anon', 'private.record_mission_event(uuid,text,jsonb)', 'EXECUTE'),
  'anonymous users cannot bypass the public event wrapper');

create temporary table w73_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_side_agent uuid := gen_random_uuid();
  v_research_agent uuid := gen_random_uuid();
  v_claimed_execution uuid := gen_random_uuid();
  v_unclaimed_execution uuid := gen_random_uuid();
  v_completed_execution uuid := gen_random_uuid();
  v_research_execution uuid := gen_random_uuid();
  v_reconciled_execution uuid := gen_random_uuid();
  v_budget_id uuid := gen_random_uuid();
  v_claimed_at timestamptz := clock_timestamp();
  v_completed_at timestamptz := clock_timestamp();
  v_reconciled_at timestamptz := clock_timestamp();
  v_side_authority jsonb := '{"mode":"bounded","external_side_effects":true,"requires_approval":true}'::jsonb;
  v_research_authority jsonb := '{"mode":"read_only","external_side_effects":false,"requires_approval":false}'::jsonb;
  v_caught boolean;
begin
  insert into auth.users(id) values (v_owner), (v_member), (v_outsider);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'W73 trusted system mission-event test');
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_owner, 'owner'), (v_workspace, v_member, 'member');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Validate trusted and user-attributed audit events', 'READY');

  insert into public.workspace_agents(id, workspace_id, name, description, status, authority, created_by)
  values
    (v_side_agent, v_workspace, 'W73 side-effect fixture', 'Disposable fake-only test agent', 'ACTIVE', v_side_authority, v_owner),
    (v_research_agent, v_workspace, 'W73 research fixture', 'Disposable read-only research test agent', 'ACTIVE', v_research_authority, v_owner);

  insert into public.mission_authority_budgets(
    id, workspace_id, mission_id, agent_id, authority_revision, authority_hash, status,
    not_before, expires_at, action_limit, actions_reserved, actions_consumed,
    max_spend, max_spend_per_action, spend_reserved, spend_consumed, currency, created_by
  ) values (
    v_budget_id, v_workspace, v_mission, v_side_agent, 7,
    encode(extensions.digest(convert_to(v_side_authority::text, 'UTF8'), 'sha256'), 'hex'),
    'ACTIVE', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour',
    2, 1, 0, 10, 10, 4, 0, 'USD', v_owner
  );

  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, dispatch_claimed_at,
    dispatch_claim_authority_hash, dispatch_claim_request_hash, dispatch_claim_budget_revision
  ) values (
    v_claimed_execution, v_workspace, v_mission, v_side_agent, v_owner,
    'w73-claimed-execution-key-0001', 'RUNNING', v_side_authority,
    '{"destination":"https://example.invalid/w73/claimed","audience":"w73-test.v1"}'::jsonb,
    v_claimed_at, repeat('a',64), repeat('b',64), 7
  );

  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request
  ) values (
    v_unclaimed_execution, v_workspace, v_mission, v_side_agent, v_owner,
    'w73-unclaimed-execution-key-0001', 'RUNNING', v_side_authority,
    '{"destination":"https://example.invalid/w73/unclaimed","audience":"w73-test.v1"}'::jsonb
  );

  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, evidence, dispatch_claimed_at,
    dispatch_claim_authority_hash, dispatch_claim_request_hash,
    dispatch_claim_budget_revision, completed_at
  ) values (
    v_completed_execution, v_workspace, v_mission, v_side_agent, v_owner,
    'w73-completed-execution-key-0001', 'SUCCEEDED', v_side_authority,
    '{"destination":"https://example.invalid/w73/completed","audience":"w73-test.v1"}'::jsonb,
    '{"provider_receipt":{"id":"w73-correlated-provider-receipt-0001"}}'::jsonb,
    v_claimed_at, repeat('a',64), repeat('b',64), 7, v_completed_at
  );

  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, result, evidence, completed_at
  ) values (
    v_research_execution, v_workspace, v_mission, v_research_agent, v_owner,
    'w73-read-only-research-execution-key-0001', 'SUCCEEDED', v_research_authority,
    '{"type":"read_only_research","request_id":"w73-read-only-request-0001"}'::jsonb,
    '{"summary":"Bounded unverified research result","source_count":0}'::jsonb,
    '{"outcome":"SUCCEEDED","verified":false,"request_id":"w73-read-only-request-0001","sources":[]}'::jsonb,
    v_completed_at
  );

  insert into public.mission_authority_budgets(
    id, workspace_id, mission_id, agent_id, authority_revision, authority_hash, status,
    not_before, expires_at, action_limit, actions_reserved, actions_consumed,
    max_spend, max_spend_per_action, spend_reserved, spend_consumed, currency, created_by
  ) values (
    gen_random_uuid(), v_workspace, v_mission, v_side_agent, 8,
    encode(extensions.digest(convert_to(v_side_authority::text, 'UTF8'), 'sha256'), 'hex'),
    'SUPERSEDED', clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour',
    2, 1, 0, 10, 10, 4, 0, 'USD', v_owner
  );

  insert into public.agent_executions(
    id, workspace_id, mission_id, agent_id, requested_by, idempotency_key,
    status, authority_snapshot, request, evidence, error_code,
    heartbeat_at, lease_expires_at, attempt_number, completed_at, reconciled_at
  ) values (
    v_reconciled_execution, v_workspace, v_mission, v_side_agent, v_owner,
    'w73-reconciled-execution-key-0001', 'UNKNOWN', v_side_authority,
    '{"authority_budget_revision":"7","destination":"https://example.invalid/w73/reconciled","audience":"w73-test.v1"}'::jsonb,
    '{"outcome":"unknown","safe_to_retry":false,"reconciliation_required":true,"budget_reservation_status":"HELD_UNKNOWN","reconciliation_reason":"lease_expired"}'::jsonb,
    'EXECUTION_LEASE_EXPIRED', clock_timestamp() - interval '7 minutes',
    clock_timestamp() - interval '1 minute', 1, v_reconciled_at, v_reconciled_at
  );

  insert into public.mission_authority_budget_reservations(
    budget_id, execution_id, reserved_actions, reserved_spend, currency, status
  ) values (v_budget_id, v_reconciled_execution, 1, 4, 'USD', 'HELD_UNKNOWN');

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  perform public.record_mission_event(v_mission, 'AGENT_EXECUTION_DISPATCH_CLAIMED',
    jsonb_build_object('execution_id', v_claimed_execution,
      'authority_budget_revision', 7, 'dispatch_claimed_at', v_claimed_at,
      'authority_hash', repeat('a',64), 'request_hash', repeat('b',64)));
  insert into w73_behavior_results values ('trusted_dispatch_event_is_system', exists (
    select 1 from public.mission_events
     where mission_id = v_mission and event_type = 'AGENT_EXECUTION_DISPATCH_CLAIMED'
       and payload ->> 'execution_id' = v_claimed_execution::text
       and actor_type = 'SYSTEM' and actor_id is null and owner_id = v_owner
  ));

  perform public.record_mission_event(v_mission, 'AGENT_EXECUTION_COMPLETED',
    jsonb_build_object('execution_id', v_completed_execution,
      'agent_id', v_side_agent, 'action_id', null, 'status', 'SUCCEEDED', 'approval_id', null));
  insert into w73_behavior_results values ('trusted_completion_event_matches_ledger', exists (
    select 1 from public.mission_events
     where mission_id = v_mission and event_type = 'AGENT_EXECUTION_COMPLETED'
       and payload ->> 'execution_id' = v_completed_execution::text
       and actor_type = 'SYSTEM' and actor_id is null and payload ->> 'status' = 'SUCCEEDED'
  ));

  v_caught := false;
  begin
    perform public.record_mission_event(v_mission, 'AGENT_EXECUTION_DISPATCH_CLAIMED',
      jsonb_build_object('execution_id', v_unclaimed_execution,
        'authority_budget_revision', 7, 'dispatch_claimed_at', v_claimed_at,
        'authority_hash', repeat('a',64), 'request_hash', repeat('b',64)));
  exception when sqlstate '22023' then
    if sqlerrm = 'SYSTEM_EVENT_DISPATCH_CLAIM_MISMATCH' then v_caught := true; else raise; end if;
  end;
  insert into w73_behavior_results values ('unclaimed_execution_cannot_emit_dispatch_event', v_caught);

  v_caught := false;
  begin
    perform public.record_mission_event(v_mission, 'ARBITRARY_SYSTEM_EVENT',
      jsonb_build_object('execution_id', v_claimed_execution));
  exception when sqlstate '42501' then
    if sqlerrm = 'SYSTEM_EVENT_TYPE_FORBIDDEN' then v_caught := true; else raise; end if;
  end;
  insert into w73_behavior_results values ('service_role_event_type_is_allowlisted', v_caught);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  perform public.record_mission_event(v_mission, 'W73_USER_AUDIT', '{"origin":"owner"}'::jsonb);
  insert into w73_behavior_results values ('owner_event_is_user_attributed', exists (
    select 1 from public.mission_events
     where mission_id = v_mission and event_type = 'W73_USER_AUDIT'
       and actor_type = 'USER' and actor_id = v_owner and owner_id = v_owner
  ));

  perform set_config('request.jwt.claim.sub', v_member::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  perform public.record_mission_event(v_mission, 'W73_MEMBER_AUDIT', '{"origin":"member"}'::jsonb);
  insert into w73_behavior_results values ('workspace_editor_is_user_attributed', exists (
    select 1 from public.mission_events
     where mission_id = v_mission and event_type = 'W73_MEMBER_AUDIT'
       and actor_type = 'USER' and actor_id = v_member and owner_id = v_owner
  ));

  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin
    perform public.record_mission_event(v_mission, 'W73_FORBIDDEN_AUDIT', '{}'::jsonb);
  exception when sqlstate '42501' then
    if sqlerrm = 'MISSION_NOT_FOUND_OR_FORBIDDEN' then v_caught := true; else raise; end if;
  end;
  insert into w73_behavior_results values ('cross_workspace_user_is_denied', v_caught);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin
    perform public.record_mission_event(v_mission, 'AGENT_EXECUTION_DISPATCH_CLAIMED',
      jsonb_build_object('execution_id', v_claimed_execution,
        'authority_budget_revision', 7, 'dispatch_claimed_at', v_claimed_at,
        'authority_hash', repeat('a',64), 'request_hash', repeat('b',64)));
  exception when sqlstate '42501' then
    if sqlerrm = 'SYSTEM_EVENT_TRUSTED_EXECUTOR_REQUIRED' then v_caught := true; else raise; end if;
  end;
  insert into w73_behavior_results values ('authenticated_user_cannot_forge_system_claim', v_caught);

  perform public.record_mission_event(v_mission, 'AGENT_EXECUTION_COMPLETED',
    jsonb_build_object('execution_id', v_research_execution,
      'agent_id', v_research_agent, 'status', 'SUCCEEDED',
      'verified', false, 'read_only_research', true,
      'request_id', 'w73-read-only-request-0001'));
  insert into w73_behavior_results values ('w64_read_only_completion_event_remains_available', exists (
    select 1 from public.mission_events
     where mission_id = v_mission and event_type = 'AGENT_EXECUTION_COMPLETED'
       and payload ->> 'execution_id' = v_research_execution::text
       and actor_type = 'USER' and actor_id = v_owner
  ));

  perform public.record_mission_event(v_mission, 'AGENT_EXECUTION_RECONCILED',
    jsonb_build_object('execution_id', v_reconciled_execution,
      'status', 'UNKNOWN', 'error_code', 'EXECUTION_LEASE_EXPIRED',
      'safe_to_retry', false, 'reconciliation_required', true,
      'budget_reservation_id', (select id from public.mission_authority_budget_reservations where execution_id = v_reconciled_execution),
      'budget_reservation_status', 'HELD_UNKNOWN',
      'reconciled_at', v_reconciled_at));
  insert into w73_behavior_results values ('w71_stale_recovery_event_remains_user_attributed', exists (
    select 1 from public.mission_events
     where mission_id = v_mission and event_type = 'AGENT_EXECUTION_RECONCILED'
       and payload ->> 'execution_id' = v_reconciled_execution::text
       and actor_type = 'USER' and actor_id = v_owner
  ));
end;
$behavior$;

select ok((select passed from w73_behavior_results where name = 'trusted_dispatch_event_is_system'),
  'trusted dispatch claim is logged as SYSTEM with no fabricated user actor');
select ok((select passed from w73_behavior_results where name = 'trusted_completion_event_matches_ledger'),
  'trusted completion event must match the persisted final execution state');
select ok((select passed from w73_behavior_results where name = 'unclaimed_execution_cannot_emit_dispatch_event'),
  'a dispatch event cannot exist without a persisted one-time claim');
select ok((select passed from w73_behavior_results where name = 'service_role_event_type_is_allowlisted'),
  'service_role cannot write arbitrary SYSTEM event types');
select ok((select passed from w73_behavior_results where name = 'owner_event_is_user_attributed'),
  'mission owner events retain USER attribution');
select ok((select passed from w73_behavior_results where name = 'workspace_editor_is_user_attributed'),
  'workspace editors can append user-attributed history to their mission');
select ok((select passed from w73_behavior_results where name = 'cross_workspace_user_is_denied'),
  'users outside the workspace cannot append mission history');
select ok((select passed from w73_behavior_results where name = 'authenticated_user_cannot_forge_system_claim'),
  'authenticated users cannot forge the trusted dispatch event');
select ok((select passed from w73_behavior_results where name = 'w64_read_only_completion_event_remains_available'),
  'the narrow W64 read-only research path still records its unverified completion');
select ok((select passed from w73_behavior_results where name = 'w71_stale_recovery_event_remains_user_attributed'),
  'the W71 owner/admin stale-recovery audit remains available and user-attributed');

select * from finish();
rollback;

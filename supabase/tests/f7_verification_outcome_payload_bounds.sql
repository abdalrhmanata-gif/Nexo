-- F7: database-level verification and outcome payload bounds.
begin;
create extension if not exists pgtap;
select plan(12);

select ok(to_regprocedure('private.mission_jsonb_within_bounds(jsonb,integer,integer,integer)') is not null,
  'shared JSONB bounds validator exists');
select ok((select provolatile = 'i' from pg_proc
  where oid = 'private.mission_jsonb_within_bounds(jsonb,integer,integer,integer)'::regprocedure),
  'JSONB bounds validator is immutable');
select ok(
  not has_function_privilege('anon', 'private.mission_jsonb_within_bounds(jsonb,integer,integer,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.mission_jsonb_within_bounds(jsonb,integer,integer,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.mission_jsonb_within_bounds(jsonb,integer,integer,integer)', 'EXECUTE')
  and not exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'private.mission_jsonb_within_bounds(jsonb,integer,integer,integer)'::regprocedure
       and a.grantee = 0
       and a.privilege_type = 'EXECUTE'
  ),
  'JSONB bounds validator is not executable by PUBLIC, anon, authenticated, or service_role'
);
select ok(
  not has_function_privilege('anon', 'private.enforce_mission_verification_outcome_payload_bounds()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.enforce_mission_verification_outcome_payload_bounds()', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.enforce_mission_verification_outcome_payload_bounds()', 'EXECUTE')
  and not exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'private.enforce_mission_verification_outcome_payload_bounds()'::regprocedure
       and a.grantee = 0
       and a.privilege_type = 'EXECUTE'
  ),
  'verification/outcome trigger function is not executable by PUBLIC, anon, authenticated, or service_role'
);
select ok(exists (
  select 1 from pg_trigger
   where tgrelid = 'public.mission_verifications'::regclass
     and tgname = 'mission_verifications_payload_bounds'
     and not tgisinternal
), 'verification table enforces payload bounds on insert and update');
select ok(exists (
  select 1 from pg_trigger
   where tgrelid = 'public.mission_outcomes'::regclass
     and tgname = 'mission_outcomes_payload_bounds'
     and not tgisinternal
), 'outcome table enforces payload bounds on insert and update');
select ok(not private.mission_jsonb_within_bounds(
  jsonb_build_object('payload', repeat('x', 65537)), 65536, 12, 1024
), 'JSONB byte ceiling rejects oversized values');
select ok(not private.mission_jsonb_within_bounds(
  '{"k":{"k":{"k":{"k":{"k":{"k":{"k":{"k":{"k":{"k":{"k":{"k":{"k":true}}}}}}}}}}}}}'::jsonb,
  65536, 12, 1024
), 'JSONB depth ceiling rejects excessive nesting');
select ok(not private.mission_jsonb_within_bounds(
  (select jsonb_object_agg('k' || n, n) from generate_series(1, 1025) n),
  65536, 12, 1024
), 'JSONB node ceiling rejects excessive object fields');

create temporary table f7_behavior_results (
  name text primary key,
  passed boolean not null
) on commit drop;

do $behavior$
declare
  v_owner uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_mission uuid := gen_random_uuid();
  v_verification public.mission_verifications;
  v_caught boolean;
begin
  insert into auth.users(id) values (v_owner);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_owner, 'F7 verification/outcome payload bounds');
  insert into public.missions(id, workspace_id, owner_id, objective, status)
  values (v_mission, v_workspace, v_owner, 'Verify bounded evidence', 'VERIFYING');

  insert into public.mission_verifications(mission_id, owner_id, status, criteria, evidence)
  values (v_mission, v_owner, 'VERIFIED', '{"criteria":"bounded"}', '{"evidence":"bounded"}')
  returning * into v_verification;
  insert into f7_behavior_results values ('valid_verification_accepted', v_verification.id is not null);

  v_caught := false;
  begin
    insert into public.mission_verifications(mission_id, owner_id, status, criteria, evidence)
    values (v_mission, v_owner, 'VERIFIED', '{"criteria":"bounded"}',
      jsonb_build_object('payload', repeat('x', 65537)));
  exception when sqlstate '22023' then
    if sqlerrm = 'MISSION_VERIFICATION_PAYLOAD_TOO_LARGE' then v_caught := true; else raise; end if;
  end;
  insert into f7_behavior_results values ('oversized_verification_rejected', v_caught);

  v_caught := false;
  begin
    insert into public.mission_outcomes(mission_id, owner_id, verification_id, status, result, success_score)
    values (v_mission, v_owner, v_verification.id, 'COMPLETED',
      jsonb_build_object('payload', repeat('x', 65537)), 1);
  exception when sqlstate '22023' then
    if sqlerrm = 'MISSION_OUTCOME_PAYLOAD_TOO_LARGE' then v_caught := true; else raise; end if;
  end;
  insert into f7_behavior_results values ('oversized_outcome_rejected', v_caught);
end;
$behavior$;

select ok((select passed from f7_behavior_results where name = 'valid_verification_accepted'),
  'ordinary verification evidence remains accepted');
select ok((select passed from f7_behavior_results where name = 'oversized_verification_rejected'),
  'oversized verification criteria/evidence are rejected by the table trigger');
select ok((select passed from f7_behavior_results where name = 'oversized_outcome_rejected'),
  'oversized outcome result is rejected by the table trigger');

select * from finish();
rollback;

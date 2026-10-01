-- Run only in ZAVQERA Development (mrwmmbytcymqgwvcoywd), as postgres.
-- This is not a migration. No fixture survives the inner exception rollback.
-- SQL identity simulation exercises RLS/RPCs, not real browser authentication.
-- The intentional ZX022 summary exception also rolls back the outer statement.
do $test$
declare
  u uuid := gen_random_uuid();
  other_u uuid := gen_random_uuid();
  w uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  cancelled uuid := gen_random_uuid();
  pending uuid := gen_random_uuid();
  v public.mission_verifications;
  o public.mission_outcomes;
  again public.mission_outcomes;
  mr public.missions;
  ar public.mission_actions;
  due timestamptz := now() + interval '2 days';
  results jsonb := '[]';
begin
  begin
    insert into auth.users(id) values (u), (other_u);
    insert into public.workspaces(id, owner_id, name) values (w, u, 'W21 rollback-only fixture');
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);
    insert into public.missions(id, workspace_id, owner_id, objective)
      values (m,w,u,'W21 rollback-only technical check');
    insert into public.mission_actions(id,mission_id,title,position)
      values (a,m,'Required technical check',0),(cancelled,m,'Intentionally cancelled check',1);
    select * into mr from public.transition_mission(m,'PLANNING',1);
    select * into mr from public.transition_mission(m,'READY',mr.version);
    select * into mr from public.transition_mission(m,'RUNNING',mr.version);
    select * into ar from public.transition_mission_action(a,'RUNNING',1);
    select * into ar from public.transition_mission_action(a,'BLOCKED',ar.version,due,true);
    if not exists(select 1 from public.mission_actions where id=a and status='BLOCKED' and follow_up_at=due) then
      raise exception 'TEST_FAILED: follow-up persistence';
    end if;
    results := results || '["PASS: authenticated-role create/lifecycle/follow-up read-back"]';
    select * into ar from public.transition_mission_action(a,'RUNNING',ar.version);
    if ar.follow_up_at is not null then raise exception 'TEST_FAILED: follow-up clear'; end if;
    select * into ar from public.transition_mission_action(a,'COMPLETED',ar.version);
    perform public.transition_mission_action(cancelled,'CANCELLED',1);
    select * into mr from public.transition_mission(m,'VERIFYING',mr.version);
    select * into v from public.create_mission_verification(m,'FAILED','{}','{}',0,'Technical negative case');
    begin
      perform public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
      raise exception 'TEST_FAILED: failed verification accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'VERIFICATION_NOT_VERIFIED' then raise; end if;
    end;
    results := results || '["PASS: unverified verification rejected"]';
    select * into v from public.create_mission_verification(m,'VERIFIED','{}','{}',1,null);
    insert into public.mission_actions(id,mission_id,title,position) values(pending,m,'Required pending check',2);
    begin
      perform public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
      raise exception 'TEST_FAILED: pending action accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'ALL_ACTIONS_MUST_BE_COMPLETED' then raise; end if;
    end;
    results := results || '["PASS: completed + cancelled + pending rejected"]';
    -- Deliberately roll back this bypass reproduction independently of W20 tests.
    begin
      select * into mr from public.transition_mission(m,'COMPLETED',mr.version);
      if mr.status='COMPLETED' and not exists(select 1 from public.mission_outcomes where mission_id=m) then
        results := results || '["FAIL: direct transition completes mission with pending work and no outcome"]';
      else
        raise exception 'TEST_FAILED: unexpected direct-transition result';
      end if;
      raise exception using errcode='ZX021',message='Rollback direct-transition reproduction';
    exception when sqlstate 'ZX021' then null;
    end;
    select * into mr from public.missions where id=m;
    select * into mr from public.transition_mission(m,'PAUSED',mr.version);
    begin
      perform public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
      raise exception 'TEST_FAILED: non-verifying accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'MISSION_NOT_VERIFYING' then raise; end if;
    end;
    results := results || '["PASS: non-VERIFYING outcome rejected"]';
    select * into mr from public.transition_mission(m,'RUNNING',mr.version);
    select * into mr from public.transition_mission(m,'VERIFYING',mr.version);
    perform set_config('request.jwt.claim.sub', other_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub',other_u,'role','authenticated')::text, true);
    if exists(select 1 from public.missions where id=m) or exists(select 1 from public.mission_actions where mission_id=m) then
      raise exception 'TEST_FAILED: cross-user RLS read';
    end if;
    begin
      perform public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
      raise exception 'TEST_FAILED: cross-user outcome';
    exception when sqlstate '42501' then
      if sqlerrm <> 'MISSION_NOT_FOUND_OR_FORBIDDEN' then raise; end if;
    end;
    begin
      perform public.transition_mission_action(a,'BLOCKED',ar.version);
      raise exception 'TEST_FAILED: cross-user action';
    exception when sqlstate '42501' then
      if sqlerrm <> 'ACTION_NOT_FOUND_OR_FORBIDDEN' then raise; end if;
    end;
    results := results || '["PASS: cross-user RLS reads and outcome/action writes rejected"]';
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);
    perform public.transition_mission_action(pending,'CANCELLED',1);
    select * into o from public.commit_verified_mission_outcome(m,v.id,'{"technical_check":true}',1,'COMPLETED');
    if o.status <> 'COMPLETED' or not exists(select 1 from public.missions where id=m and status='COMPLETED') then
      raise exception 'TEST_FAILED: W20 completion';
    end if;
    select * into again from public.commit_verified_mission_outcome(m,v.id,'{"technical_check":true}',1,'COMPLETED');
    if again.id <> o.id then raise exception 'TEST_FAILED: idempotency'; end if;
    if not exists(select 1 from public.mission_actions where id=cancelled and status='CANCELLED')
       or not exists(select 1 from public.mission_events where mission_id=m and payload->>'action_id'=cancelled::text and payload->>'to_status'='CANCELLED') then
      raise exception 'TEST_FAILED: cancellation provenance';
    end if;
    results := results || '["PASS: completed + cancelled completion, idempotency, cancellation provenance"]';
    raise exception using errcode='ZX020',message='Rollback all W21 fixtures';
  exception when sqlstate 'ZX020' then null;
  end;
  if exists(select 1 from auth.users where id in (u,other_u))
     or exists(select 1 from public.workspaces where id=w)
     or exists(select 1 from public.missions where id=m)
     or exists(select 1 from public.mission_actions where mission_id=m)
     or exists(select 1 from public.mission_events where mission_id=m)
     or exists(select 1 from public.mission_verifications where mission_id=m)
     or exists(select 1 from public.mission_outcomes where mission_id=m) then
    raise exception 'TEST_FAILED: rollback cleanup';
  end if;
  raise exception using errcode='ZX022',
    message='W21_RESULTS: ' || (results || '["PASS: zero fixture rows after rollback (all seven tables)"]')::text;
end;
$test$;

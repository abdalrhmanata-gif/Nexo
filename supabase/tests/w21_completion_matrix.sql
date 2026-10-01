-- Development only: mrwmmbytcymqgwvcoywd. Run as postgres.
-- ZX022 is the intentional result/rollback, not an unexpected test failure.
do $test$
declare
  u uuid := gen_random_uuid();
  other_u uuid := gen_random_uuid();
  w uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  v public.mission_verifications;
  o public.mission_outcomes;
  again public.mission_outcomes;
  mr public.missions;
  ar public.mission_actions;
  results jsonb := '[]';
  target text;
begin
  begin
    insert into auth.users(id) values(u),(other_u);
    insert into public.workspaces(id,owner_id,name) values(w,u,'W21 completion matrix fixture');
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    begin
      insert into public.missions(workspace_id,owner_id,objective,status)
      values(w,u,'W21 completion matrix fixture','COMPLETED');
      raise exception 'TEST_FAILED: direct completed INSERT accepted';
    exception when sqlstate '42501' then null;
    end;
    results := results || '["PASS: completed INSERT rejected by RLS"]';
    insert into public.missions(id,workspace_id,owner_id,objective)
    values(m,w,u,'W21 completion matrix fixture');
    insert into public.mission_actions(id,mission_id,title,position)
    values(a,m,'Required',0),(c,m,'Cancelled',1);
    perform public.transition_mission_action(c,'CANCELLED',1);
    select * into mr from public.transition_mission(m,'PLANNING',1);
    select * into mr from public.transition_mission(m,'READY',mr.version);
    select * into mr from public.transition_mission(m,'RUNNING',mr.version);
    begin
      perform public.transition_mission(m,'COMPLETED',mr.version);
      raise exception 'TEST_FAILED: H invalid lifecycle accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'INVALID_MISSION_TRANSITION' then raise; end if;
    end;
    results := results || '["PASS H: invalid lifecycle rejected"]';
    select * into mr from public.transition_mission(m,'VERIFYING',mr.version);
    begin
      perform public.transition_mission(m,'COMPLETED',1);
      raise exception 'TEST_FAILED: stale version accepted';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'STALE_VERSION' then raise; end if;
    end;
    results := results || '["PASS: stale version rejected"]';
    begin
      perform public.transition_mission(m,'COMPLETED',mr.version);
      raise exception 'TEST_FAILED: A pending/no outcome accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'ALL_ACTIONS_MUST_BE_COMPLETED' then raise; end if;
    end;
    results := results || '["PASS A: pending/no outcome rejected"]';
    select * into v from public.create_mission_verification(m,'FAILED','{}','{}',0,'Negative check');
    begin
      perform public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
      raise exception 'TEST_FAILED: failed verification accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'VERIFICATION_NOT_VERIFIED' then raise; end if;
    end;
    results := results || '["PASS: failed verification rejected by W20"]';
    select * into v from public.create_mission_verification(m,'VERIFIED','{}','{}',1,null);
    begin
      perform public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
      raise exception 'TEST_FAILED: F pending outcome accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'ALL_ACTIONS_MUST_BE_COMPLETED' then raise; end if;
    end;
    results := results || '["PASS F: pending outcome rejected"]';

    -- Seed a committed outcome shape only inside a privileged test subtransaction.
    -- Ordinary authenticated INSERT on outcomes is separately rejected below.
    begin
      execute 'reset role';
      insert into public.mission_outcomes(mission_id,owner_id,verification_id,status,result,success_score,verified)
      values(m,u,v.id,'COMPLETED','{}',1,true) returning * into o;
      execute 'set local role authenticated';
      foreach target in array array['PENDING','RUNNING','BLOCKED'] loop
        if target = 'RUNNING' then
          select * into ar from public.transition_mission_action(a,'RUNNING',1);
        elsif target = 'BLOCKED' then
          select * into ar from public.transition_mission_action(a,'BLOCKED',ar.version,now()+interval '2 days',true);
          if not exists(select 1 from public.mission_actions where id=a and follow_up_at is not null) then
            raise exception 'TEST_FAILED: follow-up read-back';
          end if;
        end if;
        begin
          perform public.transition_mission(m,'COMPLETED',mr.version);
          raise exception 'TEST_FAILED: D unresolved action accepted';
        exception when sqlstate '22023' then
          if sqlerrm <> 'ALL_ACTIONS_MUST_BE_COMPLETED' then raise; end if;
        end;
      end loop;
      results := results || '["PASS D: pending/running/blocked rejected even with valid outcome"]';
      select * into ar from public.transition_mission_action(a,'RUNNING',ar.version);
      if ar.follow_up_at is not null then raise exception 'TEST_FAILED: follow-up clear'; end if;
      select * into ar from public.transition_mission_action(a,'COMPLETED',ar.version);
      select * into mr from public.transition_mission(m,'COMPLETED',mr.version);
      if mr.status <> 'COMPLETED' then raise exception 'TEST_FAILED: C completion'; end if;
      results := results || '["PASS C: completed/cancelled with valid outcome accepted"]';
      begin
        insert into public.mission_actions(mission_id,title,position) values(m,'Late pending work',2);
        raise exception 'TEST_FAILED: action insert into completed mission';
      exception when sqlstate '22023' then
        if sqlerrm <> 'MISSION_ALREADY_COMPLETED' then raise; end if;
      end;
      results := results || '["PASS: post-completion action insertion rejected"]';
      raise exception using errcode='ZX021',message='Rollback C/D seeded outcome';
    exception when sqlstate 'ZX021' then null;
    end;
    select * into mr from public.missions where id=m;
    select * into ar from public.transition_mission_action(a,'RUNNING',1);
    select * into ar from public.transition_mission_action(a,'COMPLETED',ar.version);
    begin
      perform public.transition_mission(m,'COMPLETED',mr.version);
      raise exception 'TEST_FAILED: B missing outcome accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'VERIFIED_OUTCOME_REQUIRED' then raise; end if;
    end;
    results := results || '["PASS B: completed/cancelled without outcome rejected"]';
    begin
      execute 'reset role';
      insert into public.mission_outcomes(mission_id,owner_id,verification_id,status,result,success_score,verified)
      select m,u,id,'COMPLETED','{}',1,true from public.mission_verifications
      where mission_id=m and status='FAILED';
      execute 'set local role authenticated';
      begin
        perform public.transition_mission(m,'COMPLETED',mr.version);
        raise exception 'TEST_FAILED: outcome with failed verification accepted';
      exception when sqlstate '22023' then
        if sqlerrm <> 'VERIFIED_OUTCOME_REQUIRED' then raise; end if;
      end;
      results := results || '["PASS: direct transition rejects outcome linked to failed verification"]';
      raise exception using errcode='ZX021',message='Rollback invalid outcome';
    exception when sqlstate 'ZX021' then null;
    end;
    select * into mr from public.transition_mission(m,'PAUSED',mr.version);
    begin
      perform public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
      raise exception 'TEST_FAILED: non-verifying outcome accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'MISSION_NOT_VERIFYING' then raise; end if;
    end;
    results := results || '["PASS: non-VERIFYING outcome rejected"]';
    select * into mr from public.transition_mission(m,'RUNNING',mr.version);
    select * into mr from public.transition_mission(m,'VERIFYING',mr.version);
    begin
      insert into public.mission_outcomes(mission_id,owner_id,verification_id,status,result,success_score,verified)
      values(m,u,v.id,'COMPLETED','{}',1,true);
      raise exception 'TEST_FAILED: authenticated outcome INSERT accepted';
    exception when sqlstate '42501' then null;
    end;
    begin
      update public.missions set status='COMPLETED' where id=m;
      raise exception 'TEST_FAILED: authenticated direct UPDATE accepted';
    exception when sqlstate '42501' then null;
    end;
    results := results || '["PASS: direct UPDATE/outcome INSERT denied"]';
    perform set_config('request.jwt.claim.sub',other_u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',other_u,'role','authenticated')::text,true);
    begin
      perform public.transition_mission(m,'COMPLETED',mr.version);
      raise exception 'TEST_FAILED: G cross-user accepted';
    exception when sqlstate '42501' then
      if sqlerrm <> 'MISSION_NOT_FOUND_OR_FORBIDDEN' then raise; end if;
    end;
    results := results || '["PASS G: cross-user transition rejected"]';
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
    begin
      perform public.transition_mission(m,'COMPLETED',mr.version);
      raise exception 'TEST_FAILED: unauthenticated transition accepted';
    exception when sqlstate '42501' then
      if sqlerrm <> 'AUTHENTICATION_REQUIRED' then raise; end if;
    end;
    results := results || '["PASS: authentication required"]';
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    select * into o from public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
    if o.status <> 'COMPLETED' or not exists(select 1 from public.missions where id=m and status='COMPLETED') then
      raise exception 'TEST_FAILED: E W20 outcome path';
    end if;
    results := results || '["PASS E: W20 completed/cancelled outcome succeeds"]';
    select * into again from public.commit_verified_mission_outcome(m,v.id,'{}',1,'COMPLETED');
    if again.id <> o.id or (select count(*) from public.mission_outcomes where mission_id=m) <> 1 then
      raise exception 'TEST_FAILED: I idempotency';
    end if;
    results := results || '["PASS I: idempotency/no duplicate"]';
    if not exists(select 1 from public.mission_actions where id=c and status='CANCELLED')
       or not exists(select 1 from public.mission_events where mission_id=m and payload->>'action_id'=c::text and payload->>'to_status'='CANCELLED') then
      raise exception 'TEST_FAILED: J audit';
    end if;
    results := results || '["PASS J: cancellation row/event retained"]';
    raise exception using errcode='ZX020',message='Rollback all matrix fixtures';
  exception when sqlstate 'ZX020' then null;
  end;
  if exists(select 1 from auth.users where id in(u,other_u))
    or exists(select 1 from public.profiles where id in(u,other_u))
    or exists(select 1 from public.workspaces where id=w)
    or exists(select 1 from public.missions where id=m)
    or exists(select 1 from public.mission_actions where mission_id=m)
    or exists(select 1 from public.mission_events where mission_id=m)
    or exists(select 1 from public.mission_verifications where mission_id=m)
    or exists(select 1 from public.mission_outcomes where mission_id=m) then
    raise exception 'TEST_FAILED: cleanup';
  end if;
  raise exception using errcode='ZX022',message='W21_MATRIX: ' || (results || '["PASS: zero fixtures in all eight tables"]')::text;
end;
$test$;

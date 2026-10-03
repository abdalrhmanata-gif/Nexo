-- Development-only rollback smoke test for W29 AI quota functions.
-- Run as postgres against ZAVQERA Development. No fixture survives this statement.
do $test$
declare
  u uuid := gen_random_uuid(); other_u uuid := gen_random_uuid();
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r uuid;
  a boolean; used_before integer; v_limit integer; i integer; request_key text;
  results text[] := array[]::text[];
begin
  begin
    insert into auth.users(id) values (u),(other_u);
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    select x.generations_used,x.monthly_limit into used_before,v_limit from public.get_ai_usage() x;
    if used_before <> 0 or v_limit <> 20 then raise exception 'TEST_FAILED: initial quota used %, limit %',used_before,v_limit; end if;
    select allowed,reservation_id into a,r1 from public.reserve_ai_generation('quota-test-request-0001');
    if not a or r1 is null then raise exception 'TEST_FAILED: first reserve'; end if;
    select allowed,reservation_id into a,r from public.reserve_ai_generation('quota-test-request-0001');
    if a or r is not null then raise exception 'TEST_FAILED: duplicate idempotency key was not rejected fail-closed'; end if;
    execute 'reset role';
    select generations_used into used_before from public.ai_usage_monthly where user_id=u and period_start=date_trunc('month',timezone('utc',now()))::date;
    if used_before <> 1 or (select count(*) from public.ai_usage_reservations where user_id=u and request_id='quota-test-request-0001') <> 1 then raise exception 'TEST_FAILED: duplicate request double-counted'; end if;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    if not public.consume_ai_generation(r1) then raise exception 'TEST_FAILED: first consume'; end if;
    if public.consume_ai_generation(r1) then raise exception 'TEST_FAILED: consume not idempotent'; end if;
    if public.release_ai_generation(r1) then raise exception 'TEST_FAILED: consumed reservation released'; end if;
    results := array_append(results,'PASS: quota starts at zero; duplicate request key fails closed without double charge');
    select allowed,reservation_id into a,r2 from public.reserve_ai_generation('quota-test-request-0002');
    if not a or r2 is null then raise exception 'TEST_FAILED: second reserve'; end if;
    if not public.release_ai_generation(r2) then raise exception 'TEST_FAILED: first release'; end if;
    if public.release_ai_generation(r2) then raise exception 'TEST_FAILED: release not idempotent'; end if;
    execute 'reset role';
    select generations_used into used_before from public.ai_usage_monthly where user_id=u and period_start=date_trunc('month',timezone('utc',now()))::date;
    if used_before <> 1 then raise exception 'TEST_FAILED: release accounting'; end if;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    select allowed,reservation_id into a,r3 from public.reserve_ai_generation('quota-test-request-0003');
    if not a or r3 is null then raise exception 'TEST_FAILED: expiry seed reserve'; end if;
    execute 'reset role';
    update public.ai_usage_reservations set expires_at=now()-interval '1 second' where id=r3;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    select allowed,reservation_id into a,r4 from public.reserve_ai_generation('quota-test-request-0004');
    if not a or r4 is null then raise exception 'TEST_FAILED: reserve after expiry'; end if;
    execute 'reset role';
    select generations_used into used_before from public.ai_usage_monthly where user_id=u and period_start=date_trunc('month',timezone('utc',now()))::date;
    if used_before <> 2 or exists(select 1 from public.ai_usage_reservations where id=r3) then raise exception 'TEST_FAILED: expired reservation cleanup/accounting'; end if;
    results := array_append(results,'PASS: consume/release are one-shot; release decrements once; expired reservation cleanup reclaims quota');
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',other_u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',other_u,'role','authenticated')::text,true);
    if public.consume_ai_generation(r4) then raise exception 'TEST_FAILED: cross-user consumed reservation'; end if;
    if public.release_ai_generation(r4) then raise exception 'TEST_FAILED: cross-user released reservation'; end if;
    results := array_append(results,'PASS: cross-user cannot consume or release another user reservation');
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    for i in 1..18 loop
      request_key := 'quota-cap-test-request-' || lpad(i::text,4,'0');
      select allowed,reservation_id into a,r from public.reserve_ai_generation(request_key);
      if not a or r is null then raise exception 'TEST_FAILED: quota filled early at %',i; end if;
    end loop;
    select allowed,reservation_id into a,r from public.reserve_ai_generation('quota-cap-test-request-over');
    if a or r is not null then raise exception 'TEST_FAILED: quota cap not enforced'; end if;
    if not public.release_ai_generation(r4) then raise exception 'TEST_FAILED: free one slot'; end if;
    select allowed,reservation_id into a,r from public.reserve_ai_generation('quota-cap-test-request-after-release');
    if not a or r is null then raise exception 'TEST_FAILED: quota not restored after release'; end if;
    execute 'reset role';
    select generations_used into used_before from public.ai_usage_monthly where user_id=u and period_start=date_trunc('month',timezone('utc',now()))::date;
    if used_before <> 20 then raise exception 'TEST_FAILED: final quota count expected 20 got %',used_before; end if;
    results := array_append(results,'PASS: monthly limit enforced at 20; releasing reservation restores one slot');
    raise exception using errcode='ZX020',message='Rollback all AI quota fixtures';
  exception when sqlstate 'ZX020' then null;
  end;
  if exists(select 1 from auth.users where id in (u,other_u))
     or exists(select 1 from public.ai_usage_monthly where user_id in (u,other_u))
     or exists(select 1 from public.ai_usage_reservations where user_id in (u,other_u))
     or exists(select 1 from public.ai_entitlements where user_id in (u,other_u))
     or exists(select 1 from public.profiles where id in (u,other_u)) then
    raise exception 'TEST_FAILED: quota cleanup rollback';
  end if;
  raise notice 'W29 AI quota smoke tests passed: %, zero fixture rows after rollback',array_to_string(results,'; ');
end;
$test$;

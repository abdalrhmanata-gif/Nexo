-- Development/local rollback smoke test for AI quota reservation semantics.
begin;
do \$test\$
declare
  u uuid := gen_random_uuid(); other_u uuid := gen_random_uuid();
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r uuid;
  a boolean; used_before integer; v_limit integer; i integer; request_key text;
begin
  insert into auth.users(id) values (u),(other_u);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);

  select x.generations_used,x.monthly_limit into used_before,v_limit from public.get_ai_usage() x;
  if used_before <> 0 or v_limit <> 5 then
    raise exception 'TEST_FAILED: initial quota used %, limit %',used_before,v_limit;
  end if;

  select allowed,reservation_id into a,r1 from public.reserve_ai_generation('quota-free-request-0001');
  if not a or r1 is null then raise exception 'TEST_FAILED: first reserve'; end if;
  select allowed,reservation_id into a,r from public.reserve_ai_generation('quota-free-request-0001');
  if a or r is not null then raise exception 'TEST_FAILED: duplicate idempotency key was not rejected'; end if;

  select x.generations_used into used_before from public.get_ai_usage() x;
  if used_before <> 1 then
    raise exception 'TEST_FAILED: duplicate request double-counted';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  if not public.consume_ai_generation(r1) then raise exception 'TEST_FAILED: first consume'; end if;
  if public.consume_ai_generation(r1) then raise exception 'TEST_FAILED: consume not idempotent'; end if;
  if public.release_ai_generation(r1) then raise exception 'TEST_FAILED: consumed reservation released'; end if;

  select allowed,reservation_id into a,r2 from public.reserve_ai_generation('quota-free-request-0002');
  if not a or r2 is null then raise exception 'TEST_FAILED: second reserve'; end if;
  if not public.release_ai_generation(r2) then raise exception 'TEST_FAILED: first release'; end if;
  if public.release_ai_generation(r2) then raise exception 'TEST_FAILED: release not idempotent'; end if;

  select x.generations_used into used_before from public.get_ai_usage() x;
  if used_before <> 1 then raise exception 'TEST_FAILED: release accounting'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  select allowed,reservation_id into a,r3 from public.reserve_ai_generation('quota-free-request-0003');
  if not a or r3 is null then raise exception 'TEST_FAILED: expiry seed reserve'; end if;

  execute 'reset role';
  update public.ai_usage_reservations set expires_at=now()-interval '1 second' where id=r3;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  select allowed,reservation_id into a,r4 from public.reserve_ai_generation('quota-free-request-0004');
  if not a or r4 is null then raise exception 'TEST_FAILED: reserve after expiry'; end if;

  select x.generations_used into used_before from public.get_ai_usage() x;
  if used_before <> 2 then
    raise exception 'TEST_FAILED: expired reservation cleanup/accounting';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',other_u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_u,'role','authenticated')::text,true);
  if public.consume_ai_generation(r4) then raise exception 'TEST_FAILED: cross-user consumed reservation'; end if;
  if public.release_ai_generation(r4) then raise exception 'TEST_FAILED: cross-user released reservation'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);

  for i in 1..3 loop
    request_key := 'quota-free-cap-' || lpad(i::text,4,'0');
    select allowed,reservation_id into a,r from public.reserve_ai_generation(request_key);
    if not a or r is null then raise exception 'TEST_FAILED: quota filled early at %',i; end if;
  end loop;

  select allowed,reservation_id into a,r from public.reserve_ai_generation('quota-free-cap-over');
  if a or r is not null then raise exception 'TEST_FAILED: free quota cap not enforced at five'; end if;

  raise notice 'W29 quota smoke passed: Free=5, idempotency, consume/release, expiry and cross-user fences';
end;
\$test\$;
rollback;

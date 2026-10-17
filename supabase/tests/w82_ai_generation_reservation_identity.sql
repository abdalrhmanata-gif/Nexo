begin;
create extension if not exists pgtap;
create temporary table w82_test_results(name text primary key, passed boolean not null) on commit drop;
grant all on w82_test_results to authenticated;
select plan(11);
do $test$
declare
  u uuid := gen_random_uuid();
  other_u uuid := gen_random_uuid();
  r record;
  r2 record;
  r3 record;
  expired_retry record;
  expired_state text;
  used_count integer;
  consumed boolean;
begin
  insert into auth.users(id) values (u), (other_u);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);

  select * into r from public.reserve_ai_generation(
    'w82-planner-request-0001', 'planner', repeat('a',64));
  insert into w82_test_results values ('first_reserved', r.allowed and r.reservation_id is not null);

  select * into r2 from public.reserve_ai_generation(
    'w82-planner-request-0001', 'planner', repeat('a',64));
  insert into w82_test_results values ('duplicate_denied', not r2.allowed and r2.reservation_id is null and r2.reason = 'duplicate_request');

  begin
    perform * from public.reserve_ai_generation('w82-planner-request-0001','research',repeat('a',64));
    insert into w82_test_results values ('cross_route_replay_denied', false);
  exception when sqlstate '22023' then
    insert into w82_test_results values ('cross_route_replay_denied', true);
  end;

  begin
    perform * from public.reserve_ai_generation('w82-planner-request-0001','planner',repeat('b',64));
    insert into w82_test_results values ('changed_input_replay_denied', false);
  exception when sqlstate '22023' then
    insert into w82_test_results values ('changed_input_replay_denied', true);
  end;

  execute 'reset role';
  insert into w82_test_results values (
    'legacy_reservation_bypass_removed',
    to_regprocedure('private.reserve_ai_generation(text)') is null
    and to_regprocedure('public.reserve_ai_generation(text)') is null
    and has_function_privilege('authenticated','private.reserve_ai_generation(text,text,text)','EXECUTE'));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', other_u::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',other_u,'role','authenticated')::text, true);
  consumed := public.consume_ai_generation(r.reservation_id);
  insert into w82_test_results values ('cross_user_settlement_denied', not consumed);

  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);
  consumed := public.consume_ai_generation(r.reservation_id);
  insert into w82_test_results values ('owner_consumes_once', consumed and not public.consume_ai_generation(r.reservation_id));

  insert into w82_test_results values (
    'legacy_unbound_reservation_not_reused',
    (select not allowed and reservation_id is null
       from public.reserve_ai_generation('w82-planner-request-0001','planner',repeat('a',64))));

  select * into r3 from public.reserve_ai_generation('w82-expired-request-0001','planner',repeat('c',64));
  execute 'reset role';
  update public.ai_usage_reservations set expires_at=now()-interval '1 second' where id=r3.reservation_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);
  select * into expired_retry from public.reserve_ai_generation('w82-expired-request-0001','planner',repeat('c',64));
  insert into w82_test_results values ('expired_attempt_not_redispatched', not expired_retry.allowed and expired_retry.reservation_id is null);
  execute 'reset role';
  select state into strict expired_state from public.ai_usage_reservations where id=r3.reservation_id;
  insert into w82_test_results values ('expired_attempt_is_unknown', expired_state = 'unknown');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);
  select generations_used into used_count from public.get_ai_usage();
  insert into w82_test_results values ('ambiguous_attempt_keeps_charge', used_count = 2);
end;
$test$;
select ok((select passed from w82_test_results where name='first_reserved'), 'first generation reservation is bound and issued');
select ok((select passed from w82_test_results where name='duplicate_denied'), 'same request cannot start a second provider attempt');
select ok((select passed from w82_test_results where name='cross_route_replay_denied'), 'same id cannot replay across planner/research');
select ok((select passed from w82_test_results where name='changed_input_replay_denied'), 'same id cannot replay with changed input');
select ok((select passed from w82_test_results where name='legacy_reservation_bypass_removed'), 'unbound legacy RPCs are removed; private helper requires identity and input binding');
select ok((select passed from w82_test_results where name='cross_user_settlement_denied'), 'reservation cannot be settled by another user');
select ok((select passed from w82_test_results where name='owner_consumes_once'), 'owner settles exactly once');
select ok((select passed from w82_test_results where name='legacy_unbound_reservation_not_reused'), 'legacy unbound key cannot authorize a repeat');
select ok((select passed from w82_test_results where name='expired_attempt_not_redispatched'), 'expired/ambiguous request key cannot authorize another provider attempt');
select ok((select passed from w82_test_results where name='expired_attempt_is_unknown'), 'expired reservation is retained as unknown');
select ok((select passed from w82_test_results where name='ambiguous_attempt_keeps_charge'), 'ambiguous provider outcome retains its quota charge');
select * from finish();
rollback;

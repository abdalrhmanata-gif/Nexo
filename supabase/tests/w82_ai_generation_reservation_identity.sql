begin;
create extension if not exists pgtap;
create temporary table w82_test_results(name text primary key, passed boolean not null) on commit drop;
grant all on w82_test_results to authenticated;
select plan(18);
-- Force an unrelated unique_violation from the reservation INSERT path.
-- The function must propagate it when no matching idempotency row exists.
create function public.w82_test_raise_unrelated_unique_violation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $trigger$
begin
  if new.request_id = 'w82-unrelated-unique-violation-0001' then
    raise unique_violation using message = 'W82 unrelated unique violation probe';
  end if;
  return new;
end;
$trigger$;
create trigger w82_test_unrelated_unique_violation
before insert on public.ai_usage_reservations
for each row execute function public.w82_test_raise_unrelated_unique_violation();

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

  begin
    perform * from public.reserve_ai_generation(
      'w82-unrelated-unique-violation-0001', 'planner', repeat('f',64));
    insert into w82_test_results values ('unrelated_unique_violation_propagated', false);
  exception when unique_violation then
    -- The caller is authenticated and intentionally has no direct SELECT on
    -- the reservation ledger; propagation itself is the assertion.
    insert into w82_test_results values ('unrelated_unique_violation_propagated', true);
  end;

  begin
    perform * from public.reserve_ai_generation('w82-null-kind-request-0001', null, repeat('d',64));
    insert into w82_test_results values ('null_generation_kind_rejected', false);
  exception when sqlstate '22023' then
    insert into w82_test_results values ('null_generation_kind_rejected', true);
  end;

  begin
    perform * from public.reserve_ai_generation('w82-null-hash-request-0001', 'planner', null);
    insert into w82_test_results values ('null_request_hash_rejected', false);
  exception when sqlstate '22023' then
    insert into w82_test_results values ('null_request_hash_rejected', true);
  end;

  begin
    perform * from public.reserve_ai_generation('w82-short-hash-request-0001', 'planner', repeat('e',63));
    insert into w82_test_results values ('short_request_hash_rejected', false);
  exception when sqlstate '22023' then
    insert into w82_test_results values ('short_request_hash_rejected', true);
  end;

  begin
    perform * from public.reserve_ai_generation('w82-nonhex-hash-request-0001', 'planner', repeat('G',64));
    insert into w82_test_results values ('nonhex_request_hash_rejected', false);
  exception when sqlstate '22023' then
    insert into w82_test_results values ('nonhex_request_hash_rejected', true);
  end;

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
    'bound_reservation_not_reused',
    (select not allowed and reservation_id is null
       from public.reserve_ai_generation('w82-planner-request-0001','planner',repeat('a',64))));

  -- Simulate a reservation created before W82 added generation_kind/request_hash.
  -- The follow-up migration must reject the legacy NULL identity, never reopen it.
  execute 'reset role';
  update public.ai_usage_reservations
     set generation_kind = null, request_hash = null
   where id = r.reservation_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);
  begin
    perform * from public.reserve_ai_generation(
      'w82-planner-request-0001', 'planner', repeat('a',64));
    insert into w82_test_results values ('legacy_null_identity_rejected', false);
  exception when sqlstate '22023' then
    insert into w82_test_results values ('legacy_null_identity_rejected', true);
  end;

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
select ok(
  position('on conflict (user_id, request_id) do nothing' in lower(pg_get_functiondef('private.reserve_ai_generation(text,text,text)'::regprocedure))) > 0
  and position('exception when unique_violation' in lower(pg_get_functiondef('private.reserve_ai_generation(text,text,text)'::regprocedure))) = 0,
  'global reservation identity is resolved by a targeted atomic conflict path, not a broad unique-violation handler'
);
select ok((select passed from w82_test_results where name='first_reserved'), 'first generation reservation is bound and issued');
select ok((select passed from w82_test_results where name='unrelated_unique_violation_propagated'), 'unrelated unique violations are rethrown when no matching reservation exists');
select ok((select passed from w82_test_results where name='null_generation_kind_rejected'), 'NULL generation kind is rejected');
select ok((select passed from w82_test_results where name='null_request_hash_rejected'), 'NULL request hash is rejected');
select ok((select passed from w82_test_results where name='short_request_hash_rejected'), 'request hash shorter than 64 characters is rejected');
select ok((select passed from w82_test_results where name='nonhex_request_hash_rejected'), 'request hash containing non-hex characters is rejected');
select ok((select passed from w82_test_results where name='duplicate_denied'), 'same request cannot start a second provider attempt');
select ok((select passed from w82_test_results where name='cross_route_replay_denied'), 'same id cannot replay across planner/research');
select ok((select passed from w82_test_results where name='changed_input_replay_denied'), 'same id cannot replay with changed input');
select ok((select passed from w82_test_results where name='legacy_reservation_bypass_removed'), 'unbound legacy RPCs are removed; private helper requires identity and input binding');
select ok((select passed from w82_test_results where name='cross_user_settlement_denied'), 'reservation cannot be settled by another user');
select ok((select passed from w82_test_results where name='owner_consumes_once'), 'owner settles exactly once');
select ok((select passed from w82_test_results where name='bound_reservation_not_reused'), 'an already-bound request cannot authorize a repeat');
select ok((select passed from w82_test_results where name='legacy_null_identity_rejected'), 'a pre-W82 reservation with NULL identity fields cannot authorize a repeat');
select ok((select passed from w82_test_results where name='expired_attempt_not_redispatched'), 'expired/ambiguous request key cannot authorize another provider attempt');
select ok((select passed from w82_test_results where name='expired_attempt_is_unknown'), 'expired reservation is retained as unknown');
select ok((select passed from w82_test_results where name='ambiguous_attempt_keeps_charge'), 'ambiguous provider outcome retains its quota charge');
select * from finish();
rollback;

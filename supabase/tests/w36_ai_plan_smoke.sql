-- W36 AI plan-identity/allowance smoke test.
-- Disposable transaction only; no fixture survives the rollback.
begin;
select plan(1);
do $test$
declare
  free_u uuid := gen_random_uuid();
  plus_u uuid := gen_random_uuid();
  pro_u uuid := gen_random_uuid();
  free_usage record;
  plus_usage record;
  pro_usage record;
  reservation record;
begin
  insert into auth.users(id) values (free_u),(plus_u),(pro_u);

  insert into public.ai_entitlements(user_id, plan, monthly_limit)
  values
    (plus_u, 'plus', 50),
    (pro_u, 'pro', 300);

  execute 'set local role authenticated';

  perform set_config('request.jwt.claim.sub',free_u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',free_u,'role','authenticated')::text,true);
  select * into free_usage from public.get_ai_usage();
  if free_usage.plan <> 'free' or free_usage.monthly_limit <> 5 then
    raise exception 'TEST_FAILED: Free contract is %, %',free_usage.plan,free_usage.monthly_limit;
  end if;

  perform set_config('request.jwt.claim.sub',plus_u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',plus_u,'role','authenticated')::text,true);
  select * into plus_usage from public.get_ai_usage();
  if plus_usage.plan <> 'plus' or plus_usage.monthly_limit <> 50 then
    raise exception 'TEST_FAILED: Plus contract is %, %',plus_usage.plan,plus_usage.monthly_limit;
  end if;
  select * into reservation from public.reserve_ai_generation('w36-plus-request-000001');
  if not reservation.allowed or reservation.reservation_id is null
     or reservation.monthly_limit <> 50 or reservation.remaining <> 49 then
    raise exception 'TEST_FAILED: Plus reservation contract is %, %, %',
      reservation.allowed,reservation.monthly_limit,reservation.remaining;
  end if;

  perform set_config('request.jwt.claim.sub',pro_u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',pro_u,'role','authenticated')::text,true);
  select * into pro_usage from public.get_ai_usage();
  if pro_usage.plan <> 'pro' or pro_usage.monthly_limit <> 300 then
    raise exception 'TEST_FAILED: Pro contract is %, %',pro_usage.plan,pro_usage.monthly_limit;
  end if;
  select * into reservation from public.reserve_ai_generation('w36-pro-request-000001');
  if not reservation.allowed or reservation.reservation_id is null
     or reservation.monthly_limit <> 300 or reservation.remaining <> 299 then
    raise exception 'TEST_FAILED: Pro reservation contract is %, %, %',
      reservation.allowed,reservation.monthly_limit,reservation.remaining;
  end if;
end;
$test$;
select pass('smoke test assertions passed');
select * from finish();
rollback;

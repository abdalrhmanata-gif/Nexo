begin;
create extension if not exists pgtap;
select plan(9);

select ok(
  (select count(*) = 3
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in ('anonymous_ai_visitors', 'anonymous_ai_ip_windows', 'anonymous_ai_reservations')
      and c.relrowsecurity),
  'RLS is enabled on all three anonymous quota state tables'
);

select ok(
  (select count(*) = 3
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in ('anonymous_ai_visitors', 'anonymous_ai_ip_windows', 'anonymous_ai_reservations')
      and not c.relforcerowsecurity),
  'the trusted postgres-owned SECURITY DEFINER helpers are not forced under RLS'
);

select ok(
  (select count(*) = 3
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in ('anonymous_ai_visitors', 'anonymous_ai_ip_windows', 'anonymous_ai_reservations')
      and pg_get_userbyid(c.relowner) = 'postgres'),
  'all anonymous quota state tables remain owned by the trusted postgres role'
);

select ok(
  not exists (
    select 1
      from pg_policies
     where schemaname = 'private'
       and tablename in ('anonymous_ai_visitors', 'anonymous_ai_ip_windows', 'anonymous_ai_reservations')
  ),
  'no permissive or public RLS policies exist on anonymous quota tables'
);

select ok(
  not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as privileges(privilege_name)
     where n.nspname = 'private'
       and c.relname in ('anonymous_ai_visitors', 'anonymous_ai_ip_windows', 'anonymous_ai_reservations')
       and has_table_privilege(roles.role_name, c.oid, privileges.privilege_name)
  ),
  'anon, authenticated and service_role have no direct table privileges'
);

select ok(
  (select count(*) = 3
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'reserve_anonymous_ai_generation',
        'consume_anonymous_ai_generation',
        'release_anonymous_ai_generation'
      )
      and has_function_privilege('service_role', p.oid, 'EXECUTE')),
  'service_role can execute all three public quota wrappers'
);

select ok(
  not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'reserve_anonymous_ai_generation',
         'consume_anonymous_ai_generation',
         'release_anonymous_ai_generation'
       )
       and (
         has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or exists (
           select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
            where acl.grantee = 0
              and acl.privilege_type = 'EXECUTE'
         )
       )
  ),
  'anon, authenticated and PUBLIC cannot execute the public quota wrappers'
);

select ok(
  (select count(*) = 3
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'reserve_anonymous_ai_generation',
        'consume_anonymous_ai_generation',
        'release_anonymous_ai_generation'
      )
      and not p.prosecdef
      and pg_get_userbyid(p.proowner) = 'postgres'
      and coalesce(array_to_string(p.proconfig, '|'), '') = 'search_path=pg_catalog')
  and
  (select count(*) = 3
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'reserve_anonymous_ai_generation',
        'consume_anonymous_ai_generation',
        'release_anonymous_ai_generation'
      )
      and p.prosecdef
      and pg_get_userbyid(p.proowner) = 'postgres'
      and coalesce(array_to_string(p.proconfig, '|'), '') ~ 'search_path=pg_catalog, ?private'),
  'public wrappers are invoker-owned by postgres; private helpers are postgres-owned SECURITY DEFINER with pinned search paths'
);

do $test$
declare
  v_reservation record;
begin
  execute 'set local role service_role';

  select * into v_reservation
    from public.reserve_anonymous_ai_generation(
      repeat('a', 64),
      repeat('b', 64),
      '10000000-0000-4000-8000-000000000001'::uuid
    );
  if not v_reservation.allowed or v_reservation.reservation_id is null then
    raise exception 'TEST_FAILED: service_role reserve failed after RLS enablement';
  end if;

  if not public.release_anonymous_ai_generation(v_reservation.reservation_id) then
    raise exception 'TEST_FAILED: service_role release failed after RLS enablement';
  end if;
  if public.release_anonymous_ai_generation(v_reservation.reservation_id) then
    raise exception 'TEST_FAILED: service_role release is not idempotent';
  end if;

  select * into v_reservation
    from public.reserve_anonymous_ai_generation(
      repeat('c', 64),
      repeat('d', 64),
      '10000000-0000-4000-8000-000000000002'::uuid
    );
  if not v_reservation.allowed or v_reservation.reservation_id is null then
    raise exception 'TEST_FAILED: second service_role reserve failed after RLS enablement';
  end if;

  if not public.consume_anonymous_ai_generation(v_reservation.reservation_id) then
    raise exception 'TEST_FAILED: service_role consume failed after RLS enablement';
  end if;
  if public.consume_anonymous_ai_generation(v_reservation.reservation_id) then
    raise exception 'TEST_FAILED: service_role consume is not idempotent';
  end if;

  execute 'reset role';
end;
$test$;
select ok(true, 'service_role reserve/release/consume round-trip works with RLS enabled and no table policies');

select * from finish();
rollback;

begin;
create extension if not exists pgtap;
select plan(43);

select ok(
  has_schema_privilege('service_role', 'private', 'USAGE'),
  'service_role can resolve the private implementation schema'
);

select ok(
  has_function_privilege('service_role', 'private.reserve_anonymous_ai_generation(text,text,uuid)', 'EXECUTE'),
  'service_role can execute the private reserve implementation'
);
select ok(
  not has_function_privilege('anon', 'private.reserve_anonymous_ai_generation(text,text,uuid)', 'EXECUTE'),
  'anon cannot execute the private reserve implementation'
);
select ok(
  not has_function_privilege('authenticated', 'private.reserve_anonymous_ai_generation(text,text,uuid)', 'EXECUTE'),
  'authenticated cannot execute the private reserve implementation'
);

select ok(
  has_function_privilege('service_role', 'private.consume_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'service_role can execute the private consume implementation'
);
select ok(
  not has_function_privilege('anon', 'private.consume_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'anon cannot execute the private consume implementation'
);
select ok(
  not has_function_privilege('authenticated', 'private.consume_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'authenticated cannot execute the private consume implementation'
);

select ok(
  has_function_privilege('service_role', 'private.release_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'service_role can execute the private release implementation'
);
select ok(
  not has_function_privilege('anon', 'private.release_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'anon cannot execute the private release implementation'
);
select ok(
  not has_function_privilege('authenticated', 'private.release_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'authenticated cannot execute the private release implementation'
);

select ok(
  has_function_privilege('service_role', 'public.reserve_anonymous_ai_generation(text,text,uuid)', 'EXECUTE'),
  'service_role can execute the public reserve invoker wrapper'
);
select ok(
  not has_function_privilege('anon', 'public.reserve_anonymous_ai_generation(text,text,uuid)', 'EXECUTE'),
  'anon cannot execute the public reserve wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'public.reserve_anonymous_ai_generation(text,text,uuid)', 'EXECUTE'),
  'authenticated cannot execute the public reserve wrapper'
);

select ok(
  has_function_privilege('service_role', 'public.consume_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'service_role can execute the public consume invoker wrapper'
);
select ok(
  not has_function_privilege('anon', 'public.consume_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'anon cannot execute the public consume wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'public.consume_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'authenticated cannot execute the public consume wrapper'
);

select ok(
  has_function_privilege('service_role', 'public.release_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'service_role can execute the public release invoker wrapper'
);
select ok(
  not has_function_privilege('anon', 'public.release_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'anon cannot execute the public release wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'public.release_anonymous_ai_generation(uuid)', 'EXECUTE'),
  'authenticated cannot execute the public release wrapper'
);

select ok(
  not (select prosecdef from pg_proc where oid = 'public.reserve_anonymous_ai_generation(text,text,uuid)'::regprocedure),
  'public reserve wrapper is SECURITY INVOKER'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.consume_anonymous_ai_generation(uuid)'::regprocedure),
  'public consume wrapper is SECURITY INVOKER'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.release_anonymous_ai_generation(uuid)'::regprocedure),
  'public release wrapper is SECURITY INVOKER'
);

select ok(
  (select prosecdef from pg_proc where oid = 'private.reserve_anonymous_ai_generation(text,text,uuid)'::regprocedure),
  'private reserve implementation remains SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.consume_anonymous_ai_generation(uuid)'::regprocedure),
  'private consume implementation remains SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.release_anonymous_ai_generation(uuid)'::regprocedure),
  'private release implementation remains SECURITY DEFINER'
);

select ok(
  (select proconfig::text ~ 'search_path=pg_catalog, ?private'
   from pg_proc where oid = 'private.reserve_anonymous_ai_generation(text,text,uuid)'::regprocedure),
  'private reserve implementation pins search_path'
);
select ok(
  (select proconfig::text ~ 'search_path=pg_catalog, ?private'
   from pg_proc where oid = 'private.consume_anonymous_ai_generation(uuid)'::regprocedure),
  'private consume implementation pins search_path'
);
select ok(
  (select proconfig::text ~ 'search_path=pg_catalog, ?private'
   from pg_proc where oid = 'private.release_anonymous_ai_generation(uuid)'::regprocedure),
  'private release implementation pins search_path'
);

select is(
  coalesce((select array_to_string(proconfig, '|') from pg_proc
    where oid = 'public.reserve_anonymous_ai_generation(text,text,uuid)'::regprocedure), ''),
  'search_path=pg_catalog',
  'public reserve wrapper catalog search_path is exactly pg_catalog'
);
select is(
  coalesce((select array_to_string(proconfig, '|') from pg_proc
    where oid = 'public.consume_anonymous_ai_generation(uuid)'::regprocedure), ''),
  'search_path=pg_catalog',
  'public consume wrapper catalog search_path is exactly pg_catalog'
);
select is(
  coalesce((select array_to_string(proconfig, '|') from pg_proc
    where oid = 'public.release_anonymous_ai_generation(uuid)'::regprocedure), ''),
  'search_path=pg_catalog',
  'public release wrapper catalog search_path is exactly pg_catalog'
);

select is(
  (select pg_get_userbyid(proowner) from pg_proc
    where oid = 'public.reserve_anonymous_ai_generation(text,text,uuid)'::regprocedure),
  'postgres',
  'public reserve wrapper is owned by the trusted migration role'
);
select is(
  (select pg_get_userbyid(proowner) from pg_proc
    where oid = 'public.consume_anonymous_ai_generation(uuid)'::regprocedure),
  'postgres',
  'public consume wrapper is owned by the trusted migration role'
);
select is(
  (select pg_get_userbyid(proowner) from pg_proc
    where oid = 'public.release_anonymous_ai_generation(uuid)'::regprocedure),
  'postgres',
  'public release wrapper is owned by the trusted migration role'
);
select is(
  (select pg_get_userbyid(proowner) from pg_proc
    where oid = 'private.reserve_anonymous_ai_generation(text,text,uuid)'::regprocedure),
  'postgres',
  'private reserve implementation is owned by the trusted migration role'
);
select is(
  (select pg_get_userbyid(proowner) from pg_proc
    where oid = 'private.consume_anonymous_ai_generation(uuid)'::regprocedure),
  'postgres',
  'private consume implementation is owned by the trusted migration role'
);
select is(
  (select pg_get_userbyid(proowner) from pg_proc
    where oid = 'private.release_anonymous_ai_generation(uuid)'::regprocedure),
  'postgres',
  'private release implementation is owned by the trusted migration role'
);

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reserve_anonymous_ai_generation' and p.prokind = 'f'),
  1,
  'public reserve wrapper has exactly one overload'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'consume_anonymous_ai_generation' and p.prokind = 'f'),
  1,
  'public consume wrapper has exactly one overload'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_anonymous_ai_generation' and p.prokind = 'f'),
  1,
  'public release wrapper has exactly one overload'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'reserve_anonymous_ai_generation' and p.prokind = 'f'),
  1,
  'private reserve implementation has exactly one overload'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'consume_anonymous_ai_generation' and p.prokind = 'f'),
  1,
  'private consume implementation has exactly one overload'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'release_anonymous_ai_generation' and p.prokind = 'f'),
  1,
  'private release implementation has exactly one overload'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap;
select plan(28);

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

select * from finish();
rollback;

-- W47 workspace bootstrap security gate.
begin;
create extension if not exists pgtap;
select plan(10);

select ok(to_regprocedure('public.ensure_owned_workspace()') is not null,
  'public workspace bootstrap wrapper exists');
select ok(to_regprocedure('private.ensure_owned_workspace()') is not null,
  'private workspace bootstrap implementation exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.ensure_owned_workspace()'::regprocedure),
  'public workspace bootstrap wrapper is SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid = 'private.ensure_owned_workspace()'::regprocedure),
  'private workspace bootstrap implementation is SECURITY DEFINER');
select ok(coalesce(array_to_string((select proconfig from pg_proc where oid = 'private.ensure_owned_workspace()'::regprocedure), '|'), '')
  like '%search_path=pg_catalog, public, private%',
  'private workspace bootstrap pins search_path');
select ok(not has_function_privilege('anon', 'public.ensure_owned_workspace()', 'EXECUTE'),
  'anon cannot bootstrap a workspace');
select ok(has_function_privilege('authenticated', 'public.ensure_owned_workspace()', 'EXECUTE'),
  'authenticated can bootstrap a workspace');
select ok(not has_function_privilege('anon', 'private.ensure_owned_workspace()', 'EXECUTE'),
  'anon cannot execute private workspace bootstrap');
select ok(has_function_privilege('authenticated', 'private.ensure_owned_workspace()', 'EXECUTE'),
  'authenticated may invoke private implementation through the invoker wrapper');
select ok(
  lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%auth.uid()%'
  and lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%workspace_members%'
  and lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%on conflict%'
  and lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%pg_advisory_xact_lock%',
  'bootstrap binds identity, creates owner membership idempotently, and serializes concurrent requests');

select * from finish();
rollback;

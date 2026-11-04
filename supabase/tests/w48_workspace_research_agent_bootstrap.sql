-- W48 Research Agent bootstrap security contract.
begin;
create extension if not exists pgtap;
select plan(8);

select ok(to_regprocedure('private.ensure_owned_workspace()') is not null,
  'private workspace bootstrap implementation exists');
select ok(lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%zavqera research agent%',
  'workspace bootstrap seeds the default Research Agent');
select ok(lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%bounded read-only research agent%',
  'default Research Agent description states read-only limits');
select ok(lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%mode%read_only%',
  'default Research Agent is read-only');
select ok(lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%external_side_effects%'
  and lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%requires_approval%',
  'default Research Agent explicitly denies external side effects and does not invent approval');
select ok(lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%where not exists%'
  and lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%workspace_agents%',
  'Research Agent seeding is idempotent');
select ok(lower(pg_get_functiondef('private.ensure_owned_workspace()'::regprocedure)) like '%created_by%',
  'Research Agent provenance is tied to the authenticated owner');
select ok(not (select prosecdef from pg_proc where oid = 'public.ensure_owned_workspace()'::regprocedure),
  'public workspace bootstrap wrapper remains SECURITY INVOKER');

select * from finish();
rollback;

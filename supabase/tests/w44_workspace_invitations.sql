-- W44 workspace invitation security and lifecycle contract.
begin;
create extension if not exists pgtap;

select plan(12);

select ok(to_regclass('public.workspace_invitations') is not null, 'workspace invitations table exists');
select ok((select relrowsecurity from pg_class where oid='public.workspace_invitations'::regclass), 'workspace invitations RLS enabled');
select ok(not has_table_privilege('anon','public.workspace_invitations','SELECT'), 'anon has no invitation table SELECT');
select ok(exists(select 1 from pg_constraint where conrelid='public.workspace_invitations'::regclass and conname='workspace_invitations_role_check'), 'invitation role constraint exists');
select ok(exists(select 1 from pg_constraint where conrelid='public.workspace_invitations'::regclass and conname='workspace_invitations_status_check'), 'invitation status constraint exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='create_workspace_invitation'), 'private create invitation function exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='get_workspace_invitation'), 'private get invitation function exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='accept_workspace_invitation'), 'private accept invitation function exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='revoke_workspace_invitation'), 'private revoke invitation function exists');
select ok(not has_function_privilege('anon','public.accept_workspace_invitation(text)','EXECUTE'), 'anon cannot accept invitations');
select ok(has_function_privilege('authenticated','public.accept_workspace_invitation(text)','EXECUTE'), 'authenticated can accept invitations');
select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname in ('create_workspace_invitation','get_workspace_invitation','accept_workspace_invitation','revoke_workspace_invitation')
    and p.prosecdef
    and coalesce(array_to_string(p.proconfig,'|'),'') not like '%search_path=pg_catalog, public%'
), 'all private invitation SECURITY DEFINER functions pin search_path');

select * from finish();
rollback;

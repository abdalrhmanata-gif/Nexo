-- W51 regression gate: SECURITY INVOKER public member RPCs must be able
-- to call private SECURITY DEFINER helpers, while anon remains denied.
begin;
create extension if not exists pgtap;
select plan(12);

select ok(has_function_privilege('authenticated','private.list_workspace_members(uuid)','EXECUTE'),
  'authenticated can invoke the private member-list helper through its public wrapper');
select ok(has_function_privilege('authenticated','private.update_workspace_member_role(uuid,text)','EXECUTE'),
  'authenticated can invoke the private role-update helper through its public wrapper');
select ok(has_function_privilege('authenticated','private.remove_workspace_member(uuid)','EXECUTE'),
  'authenticated can invoke the private member-removal helper through its public wrapper');

select ok(not has_function_privilege('anon','private.list_workspace_members(uuid)','EXECUTE'),
  'anon cannot execute the private member-list helper');
select ok(not has_function_privilege('anon','private.update_workspace_member_role(uuid,text)','EXECUTE'),
  'anon cannot execute the private role-update helper');
select ok(not has_function_privilege('anon','private.remove_workspace_member(uuid)','EXECUTE'),
  'anon cannot execute the private member-removal helper');

select ok(not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='list_workspace_members' and pg_get_function_identity_arguments(p.oid)='p_workspace_id uuid'),
  'public member-list wrapper remains SECURITY INVOKER');
select ok(not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='update_workspace_member_role' and pg_get_function_identity_arguments(p.oid)='p_member_id uuid, p_role text'),
  'public role-update wrapper remains SECURITY INVOKER');
select ok(not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='remove_workspace_member' and pg_get_function_identity_arguments(p.oid)='p_member_id uuid'),
  'public member-removal wrapper remains SECURITY INVOKER');

select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='list_workspace_members' and p.prosecdef
    and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=pg_catalog, public%'),
  'private member-list helper remains SECURITY DEFINER with pinned search_path');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='update_workspace_member_role' and p.prosecdef
    and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=pg_catalog, public%'),
  'private role-update helper remains SECURITY DEFINER with pinned search_path');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='remove_workspace_member' and p.prosecdef
    and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=pg_catalog, public%'),
  'private member-removal helper remains SECURITY DEFINER with pinned search_path');

select * from finish();
rollback;

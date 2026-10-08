-- W45 workspace member management security gate.
begin;
create extension if not exists pgtap;
select plan(10);
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='list_workspace_members'),'private member list exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='update_workspace_member_role'),'private role update exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='remove_workspace_member'),'private member removal exists');
select ok(not has_function_privilege('anon','public.list_workspace_members(uuid)','EXECUTE'),'anon cannot list members');
select ok(has_function_privilege('authenticated','public.list_workspace_members(uuid)','EXECUTE'),'authenticated can list members');
select ok(not has_function_privilege('anon','public.update_workspace_member_role(uuid,text)','EXECUTE'),'anon cannot change roles');
select ok(has_function_privilege('authenticated','public.update_workspace_member_role(uuid,text)','EXECUTE'),'authenticated can change roles');
select ok(not has_function_privilege('anon','public.remove_workspace_member(uuid)','EXECUTE'),'anon cannot remove members');
select ok(has_function_privilege('authenticated','public.remove_workspace_member(uuid)','EXECUTE'),'authenticated can remove members');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('list_workspace_members','update_workspace_member_role','remove_workspace_member') and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') not like '%search_path=pg_catalog, public%'),'member SECURITY DEFINER functions pin search_path');
select * from finish();
rollback;
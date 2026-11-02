-- Verify default EXECUTE privileges for newly created postgres-owned functions.
begin;
create extension if not exists pgtap;
select plan(5);

create function public.zavqera_default_function_acl_probe()
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$ select true $$;

select ok(
  not has_function_privilege('anon','public.zavqera_default_function_acl_probe()','EXECUTE'),
  'new public SECURITY DEFINER functions are not executable by anon by default'
);
select ok(
  not has_function_privilege('authenticated','public.zavqera_default_function_acl_probe()','EXECUTE'),
  'new public SECURITY DEFINER functions are not executable by authenticated by default'
);
select ok(
  not has_function_privilege('service_role','public.zavqera_default_function_acl_probe()','EXECUTE'),
  'new public SECURITY DEFINER functions are not executable by service_role by default'
);
select ok(
  not exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where p.oid='public.zavqera_default_function_acl_probe()'::regprocedure
       and a.grantee=0
       and a.privilege_type='EXECUTE'
  ),
  'new public SECURITY DEFINER functions do not inherit PUBLIC EXECUTE'
);

grant execute on function public.zavqera_default_function_acl_probe() to authenticated;
select ok(
  has_function_privilege('authenticated','public.zavqera_default_function_acl_probe()','EXECUTE')
  and not has_function_privilege('anon','public.zavqera_default_function_acl_probe()','EXECUTE')
  and not has_function_privilege('service_role','public.zavqera_default_function_acl_probe()','EXECUTE'),
  'explicit per-function grants remain available without granting other API roles'
);

drop function public.zavqera_default_function_acl_probe();
select * from finish();
rollback;

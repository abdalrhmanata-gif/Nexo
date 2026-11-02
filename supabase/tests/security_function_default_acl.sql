-- Verify default EXECUTE and sequence privileges for new postgres-owned objects across schemas.
begin;
create extension if not exists pgtap;
select plan(12);

create function public.zavqera_default_function_acl_probe()
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$ select true $$;

create sequence public.zavqera_default_sequence_acl_probe;

-- The migration's PUBLIC EXECUTE revoke is global, not public-schema scoped.
-- private is a non-exposed application schema and proves the global default.
create function private.zavqera_default_function_acl_global_probe()
returns boolean
language sql
security definer
set search_path = pg_catalog
as $body$ select true $body$;

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

select ok(
  not has_function_privilege('anon','private.zavqera_default_function_acl_global_probe()','EXECUTE')
  and not has_function_privilege('authenticated','private.zavqera_default_function_acl_global_probe()','EXECUTE')
  and not has_function_privilege('service_role','private.zavqera_default_function_acl_global_probe()','EXECUTE'),
  'global PUBLIC EXECUTE default is revoked for new functions outside public too'
);
select ok(
  not exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where p.oid='private.zavqera_default_function_acl_global_probe()'::regprocedure
       and a.grantee=0
       and a.privilege_type='EXECUTE'
  ),
  'non-public schema functions do not inherit PUBLIC EXECUTE'
);

grant execute on function public.zavqera_default_function_acl_probe() to authenticated;
select ok(
  has_function_privilege('authenticated','public.zavqera_default_function_acl_probe()','EXECUTE')
  and not has_function_privilege('anon','public.zavqera_default_function_acl_probe()','EXECUTE')
  and not has_function_privilege('service_role','public.zavqera_default_function_acl_probe()','EXECUTE'),
  'explicit per-function grants remain available without granting other API roles'
);

select ok(
  not has_sequence_privilege('anon','public.zavqera_default_sequence_acl_probe','SELECT')
  and not has_sequence_privilege('anon','public.zavqera_default_sequence_acl_probe','UPDATE')
  and not has_sequence_privilege('anon','public.zavqera_default_sequence_acl_probe','USAGE'),
  'new public sequences grant no privileges to anon by default'
);
select ok(
  not has_sequence_privilege('authenticated','public.zavqera_default_sequence_acl_probe','SELECT')
  and not has_sequence_privilege('authenticated','public.zavqera_default_sequence_acl_probe','UPDATE')
  and not has_sequence_privilege('authenticated','public.zavqera_default_sequence_acl_probe','USAGE'),
  'new public sequences grant no privileges to authenticated by default'
);
select ok(
  not has_sequence_privilege('service_role','public.zavqera_default_sequence_acl_probe','SELECT')
  and not has_sequence_privilege('service_role','public.zavqera_default_sequence_acl_probe','UPDATE')
  and not has_sequence_privilege('service_role','public.zavqera_default_sequence_acl_probe','USAGE'),
  'new public sequences grant no privileges to service_role by default'
);
select ok(
  not exists (
    select 1
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) a
     where c.oid='public.zavqera_default_sequence_acl_probe'::regclass
       and a.grantee=0
  ),
  'new public sequences do not inherit PUBLIC privileges'
);

grant usage on sequence public.zavqera_default_sequence_acl_probe to authenticated;
select ok(
  has_sequence_privilege('authenticated','public.zavqera_default_sequence_acl_probe','USAGE')
  and not has_sequence_privilege('anon','public.zavqera_default_sequence_acl_probe','USAGE')
  and not has_sequence_privilege('service_role','public.zavqera_default_sequence_acl_probe','USAGE'),
  'explicit per-sequence grants remain available without granting other API roles'
);

drop sequence public.zavqera_default_sequence_acl_probe;
drop function public.zavqera_default_function_acl_probe();
drop function private.zavqera_default_function_acl_global_probe();
select * from finish();
rollback;

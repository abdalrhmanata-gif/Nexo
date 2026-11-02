-- Regression gate for the post-W86 ACL and invitation lookup correction.
begin;
create extension if not exists pgtap;
select plan(16);

select is((
  with tables(relname) as (values
    ('workspace_members'),('workspace_agents'),('mission_approvals'),
    ('workspace_invitations'),('product_growth_events')
  ), privileges(privilege_name) as (values
    ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')
  )
  select count(*)::integer from tables cross join privileges
   where has_table_privilege('authenticated', format('public.%I',relname), privilege_name)
), 0, 'authenticated has no excess structural or maintenance privileges');

select is((
  with tables(relname) as (values
    ('ai_entitlements'),('ai_usage_monthly'),('ai_usage_reservations'),('mission_actions'),
    ('mission_approvals'),('mission_events'),('mission_outcomes'),('mission_verifications'),
    ('missions'),('product_growth_events'),('profiles'),('workspace_activity'),
    ('workspace_agents'),('workspace_invitations'),('workspace_members'),('workspaces')
  ), privileges(privilege_name) as (values
    ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')
  )
  select count(*)::integer from tables cross join privileges
   where has_table_privilege('service_role', format('public.%I',relname), privilege_name)
), 0, 'service_role has no excess structural or maintenance privileges on application tables');

select is((
  with expected(relname, privilege_name, allowed) as (values
    ('workspace_members','SELECT',true),('workspace_members','INSERT',true),('workspace_members','UPDATE',true),('workspace_members','DELETE',true),
    ('workspace_agents','SELECT',true),('workspace_agents','INSERT',true),('workspace_agents','UPDATE',true),('workspace_agents','DELETE',true),
    ('mission_approvals','SELECT',true),('mission_approvals','INSERT',true),('mission_approvals','UPDATE',true),('mission_approvals','DELETE',true),
    ('workspace_invitations','SELECT',true),('workspace_invitations','INSERT',true),('workspace_invitations','UPDATE',true),('workspace_invitations','DELETE',false),
    ('product_growth_events','SELECT',true),('product_growth_events','INSERT',true),('product_growth_events','UPDATE',false),('product_growth_events','DELETE',false)
  )
  select count(*)::integer from expected
   where has_table_privilege('authenticated',format('public.%I',relname),privilege_name) is distinct from allowed
), 0, 'authenticated DML grants match reviewed per-table contracts');

select is((
  with tables(relname) as (values
    ('ai_entitlements'),('ai_usage_monthly'),('ai_usage_reservations'),('mission_actions'),
    ('mission_approvals'),('mission_events'),('mission_outcomes'),('mission_verifications'),
    ('missions'),('product_growth_events'),('profiles'),('workspace_activity'),
    ('workspace_agents'),('workspace_invitations'),('workspace_members'),('workspaces')
  ), privileges(privilege_name) as (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'))
  select count(*)::integer from tables cross join privileges
   where not has_table_privilege('service_role',format('public.%I',relname),privilege_name)
), 0, 'service_role DML rights remain unchanged pending dependency review');

select ok(not exists (
  select 1 from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  join pg_roles grantee on grantee.oid=a.grantee
  where d.defaclrole='postgres'::regrole
    and d.defaclnamespace='public'::regnamespace
    and d.defaclobjtype='r' and grantee.rolname='anon'
), 'future public tables created by postgres do not inherit anon table privileges');

select ok(not exists (
  select 1 from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  join pg_roles grantee on grantee.oid=a.grantee
  where d.defaclrole='postgres'::regrole
    and d.defaclnamespace='public'::regnamespace
    and d.defaclobjtype='r'
    and grantee.rolname in ('authenticated','service_role')
    and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
), 'future public tables created by postgres do not inherit excess structural privileges');

select ok((select p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
                  and p.proconfig=array['search_path=pg_catalog, public']::text[]
             from pg_proc p where p.oid='public.get_workspace_invitation(text)'::regprocedure),
  'public invitation lookup is postgres-owned SECURITY DEFINER with pinned search_path');
select ok((select p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
                  and p.proconfig=array['search_path=pg_catalog, public']::text[]
             from pg_proc p where p.oid='private.get_workspace_invitation(text)'::regprocedure),
  'private invitation lookup helper remains postgres-owned SECURITY DEFINER with pinned search_path');

select is((
  select coalesce(array_agg(case when a.grantee=0 then 'PUBLIC' else grantee.rolname end
                            order by case when a.grantee=0 then 'PUBLIC' else grantee.rolname end)
                   filter(where a.privilege_type='EXECUTE' and a.grantee<>p.proowner),array[]::text[])
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    left join pg_roles grantee on grantee.oid=a.grantee
   where p.oid='public.get_workspace_invitation(text)'::regprocedure
), array['anon','authenticated']::text[], 'public invitation lookup EXECUTE grants are exact');

select is((
  select coalesce(array_agg(case when a.grantee=0 then 'PUBLIC' else grantee.rolname end
                            order by case when a.grantee=0 then 'PUBLIC' else grantee.rolname end)
                   filter(where a.privilege_type='EXECUTE' and a.grantee<>p.proowner),array[]::text[])
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    left join pg_roles grantee on grantee.oid=a.grantee
   where p.oid='private.get_workspace_invitation(text)'::regprocedure
), array[]::text[], 'private invitation lookup has no non-owner EXECUTE grants');

select is((
  select count(*)::integer from pg_proc p
   where p.oid in (
     'public.create_workspace_invitation(uuid,text,text,text,timestamptz)'::regprocedure,
     'public.accept_workspace_invitation(text)'::regprocedure,
     'public.revoke_workspace_invitation(uuid)'::regprocedure
   ) and not p.prosecdef
), 3, 'public invitation mutation wrappers remain SECURITY INVOKER');

select is((
  select count(*)::integer from pg_proc p
   where p.oid in (
     'private.create_workspace_invitation(uuid,text,text,text,timestamptz)'::regprocedure,
     'private.accept_workspace_invitation(text)'::regprocedure,
     'private.revoke_workspace_invitation(uuid)'::regprocedure
   ) and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
     and p.proconfig=array['search_path=pg_catalog, public']::text[]
), 3, 'private invitation mutation helpers remain pinned SECURITY DEFINER');

select ok(not has_schema_privilege('anon','private','USAGE'), 'anon still has no private schema USAGE');
select ok(has_schema_privilege('authenticated','private','USAGE'), 'authenticated retains private schema USAGE for invoker mutation wrappers');

set local role anon;
select is((select count(*)::integer from public.get_workspace_invitation(repeat('f',64))),
  0, 'anon can execute token lookup through public definer wrapper without private schema access');
reset role;

select throws_ok($$select * from public.get_workspace_invitation('invalid')$$,
  '22023', 'INVALID_INVITATION_TOKEN', 'public invitation lookup rejects malformed token hashes');

select * from finish();
rollback;

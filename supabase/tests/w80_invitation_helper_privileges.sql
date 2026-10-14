-- W80 invitation helper EXECUTE contract.
-- Public mutation RPCs are SECURITY INVOKER and delegate to guarded private helpers.
-- The token-gated public GET is the sole SECURITY DEFINER wrapper exception so anon
-- can use it without private-schema USAGE; it returns limited metadata only.
begin;
create extension if not exists pgtap;

select plan(49);

select is((
  select count(*)::integer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_workspace_invitation','get_workspace_invitation',
                       'accept_workspace_invitation','revoke_workspace_invitation')
), 4, 'public invitation API has exactly the four reviewed signatures (no overload bypass)');
select is((
  select count(*)::integer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('create_workspace_invitation','get_workspace_invitation',
                       'accept_workspace_invitation','revoke_workspace_invitation')
), 4, 'private invitation API has exactly the four reviewed signatures (no overload bypass)');

-- Expected effective EXECUTE matrix, including membership/inheritance from
-- other roles. Exact non-owner ACL grantees (direct grants and PUBLIC) are
-- asserted separately below. Authenticated helper access is required by the
-- invoker wrappers; anon access is allowed only for token-based lookup.
select is(has_function_privilege(role_name, signature, 'EXECUTE'), expected, description)
from (values
  ('anon','public.create_workspace_invitation(uuid,text,text,text,timestamp with time zone)',false,'anon cannot execute public invitation create'),
  ('authenticated','public.create_workspace_invitation(uuid,text,text,text,timestamp with time zone)',true,'authenticated can use public invitation create'),
  ('service_role','public.create_workspace_invitation(uuid,text,text,text,timestamp with time zone)',false,'service_role cannot execute public invitation create'),
  ('anon','public.get_workspace_invitation(text)',true,'anon can use token-gated public invitation lookup'),
  ('authenticated','public.get_workspace_invitation(text)',true,'authenticated can use public invitation lookup'),
  ('service_role','public.get_workspace_invitation(text)',false,'service_role cannot execute public invitation lookup'),
  ('anon','public.accept_workspace_invitation(text)',false,'anon cannot accept invitations'),
  ('authenticated','public.accept_workspace_invitation(text)',true,'authenticated can accept invitations'),
  ('service_role','public.accept_workspace_invitation(text)',false,'service_role cannot execute public invitation accept'),
  ('anon','public.revoke_workspace_invitation(uuid)',false,'anon cannot revoke invitations'),
  ('authenticated','public.revoke_workspace_invitation(uuid)',true,'authenticated can revoke invitations'),
  ('service_role','public.revoke_workspace_invitation(uuid)',false,'service_role cannot execute public invitation revoke'),
  ('anon','private.create_workspace_invitation(uuid,text,text,text,timestamp with time zone)',false,'anon cannot execute privileged private create helper'),
  ('authenticated','private.create_workspace_invitation(uuid,text,text,text,timestamp with time zone)',true,'authenticated wrapper caller can execute guarded private create helper'),
  ('service_role','private.create_workspace_invitation(uuid,text,text,text,timestamp with time zone)',false,'service_role cannot execute private create helper'),
  ('anon','private.get_workspace_invitation(text)',true,'anon exception is limited to the token-lookup helper explicitly used by public GET'),
  ('authenticated','private.get_workspace_invitation(text)',true,'authenticated wrapper caller can execute private lookup helper'),
  ('service_role','private.get_workspace_invitation(text)',false,'service_role cannot execute private lookup helper'),
  ('anon','private.accept_workspace_invitation(text)',false,'anon cannot execute privileged private accept helper'),
  ('authenticated','private.accept_workspace_invitation(text)',true,'authenticated wrapper caller can execute guarded private accept helper'),
  ('service_role','private.accept_workspace_invitation(text)',false,'service_role cannot execute private accept helper'),
  ('anon','private.revoke_workspace_invitation(uuid)',false,'anon cannot execute privileged private revoke helper'),
  ('authenticated','private.revoke_workspace_invitation(uuid)',true,'authenticated wrapper caller can execute guarded private revoke helper'),
  ('service_role','private.revoke_workspace_invitation(uuid)',false,'service_role cannot execute private revoke helper')
) as expected(role_name, signature, expected, description);

-- Assert exact non-owner EXECUTE ACL grantees, not only effective role checks:
-- PUBLIC grants or an unexpected role grant fail even if the current role matrix
-- does not happen to inherit that grant.
select is((
  select array_agg((case when x.grantee = 0 then 'PUBLIC' else r.rolname::text end) order by
                   case when x.grantee = 0 then 'PUBLIC' else r.rolname::text end)
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
    left join pg_roles r on r.oid = x.grantee
   where p.oid = expected.signature::regprocedure
     and x.privilege_type = 'EXECUTE'
     and x.grantee <> p.proowner
), expected.allowed_grantees, expected.description)
from (values
  ('public.create_workspace_invitation(uuid,text,text,text,timestamp with time zone)', array['authenticated']::text[], 'public create exact EXECUTE ACL'),
  ('public.get_workspace_invitation(text)', array['anon','authenticated']::text[], 'public token lookup exact EXECUTE ACL'),
  ('public.accept_workspace_invitation(text)', array['authenticated']::text[], 'public accept exact EXECUTE ACL'),
  ('public.revoke_workspace_invitation(uuid)', array['authenticated']::text[], 'public revoke exact EXECUTE ACL'),
  ('private.create_workspace_invitation(uuid,text,text,text,timestamp with time zone)', array['authenticated']::text[], 'private create exact EXECUTE ACL'),
  ('private.get_workspace_invitation(text)', array['anon','authenticated']::text[], 'private token lookup exact EXECUTE ACL'),
  ('private.accept_workspace_invitation(text)', array['authenticated']::text[], 'private accept exact EXECUTE ACL'),
  ('private.revoke_workspace_invitation(uuid)', array['authenticated']::text[], 'private revoke exact EXECUTE ACL')
) as expected(signature, allowed_grantees, description);

-- Confirm ownership, security mode and pinned search_path for every overload.
select ok((select p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig = array['search_path=pg_catalog, public']::text[]
            from pg_proc p where p.oid = 'private.create_workspace_invitation(uuid,text,text,text,timestamptz)'::regprocedure),
  'private create helper is postgres-owned SECURITY DEFINER with pinned search_path');
select ok((select p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig = array['search_path=pg_catalog, public']::text[]
            from pg_proc p where p.oid = 'private.get_workspace_invitation(text)'::regprocedure),
  'private lookup helper is postgres-owned SECURITY DEFINER with pinned search_path');
select ok((select p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig = array['search_path=pg_catalog, public']::text[]
            from pg_proc p where p.oid = 'private.accept_workspace_invitation(text)'::regprocedure),
  'private accept helper is postgres-owned SECURITY DEFINER with pinned search_path');
select ok((select p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig = array['search_path=pg_catalog, public']::text[]
            from pg_proc p where p.oid = 'private.revoke_workspace_invitation(uuid)'::regprocedure),
  'private revoke helper is postgres-owned SECURITY DEFINER with pinned search_path');
select ok((select not p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig = array['search_path=pg_catalog, public']::text[]
            from pg_proc p where p.oid = 'public.create_workspace_invitation(uuid,text,text,text,timestamptz)'::regprocedure),
  'public create wrapper is postgres-owned SECURITY INVOKER with pinned search_path');
select ok((select p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig = array['search_path=pg_catalog, public']::text[]
            from pg_proc p where p.oid = 'public.get_workspace_invitation(text)'::regprocedure),
  'public token lookup wrapper is postgres-owned SECURITY DEFINER with pinned search_path');
select ok((select not p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig = array['search_path=pg_catalog, public']::text[]
            from pg_proc p where p.oid = 'public.accept_workspace_invitation(text)'::regprocedure),
  'public accept wrapper is postgres-owned SECURITY INVOKER with pinned search_path');
select ok((select not p.prosecdef
             and pg_get_userbyid(p.proowner) = 'postgres'
             and p.proconfig = array['search_path=pg_catalog, public']::text[]
            from pg_proc p where p.oid = 'public.revoke_workspace_invitation(uuid)'::regprocedure),
  'public revoke wrapper is postgres-owned SECURITY INVOKER with pinned search_path');

select ok(position('private.create_workspace_invitation' in lower(pg_get_functiondef('public.create_workspace_invitation(uuid,text,text,text,timestamptz)'::regprocedure))) > 0,
  'public create wrapper delegates to the reviewed private helper');
select ok(position('private.get_workspace_invitation' in lower(pg_get_functiondef('public.get_workspace_invitation(text)'::regprocedure))) > 0,
  'public token lookup wrapper delegates to the reviewed private helper');
select ok(position('private.accept_workspace_invitation' in lower(pg_get_functiondef('public.accept_workspace_invitation(text)'::regprocedure))) > 0,
  'public accept wrapper delegates to the reviewed private helper');
select ok(position('private.revoke_workspace_invitation' in lower(pg_get_functiondef('public.revoke_workspace_invitation(uuid)'::regprocedure))) > 0,
  'public revoke wrapper delegates to the reviewed private helper');

select ok(has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated callers can resolve the private helpers used by invoker wrappers');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'),
  'anon cannot directly resolve private helpers despite the token-lookup helper EXECUTE exception');

set local role anon;
select lives_ok($$select * from public.get_workspace_invitation(repeat('0', 64))$$,
  'anonymous public token lookup can reach its private helper');
reset role;

select * from finish();
rollback;

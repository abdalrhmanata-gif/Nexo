-- Harden defaults for future postgres-owned API objects.
-- Historical function/sequence ACLs are not changed by ALTER DEFAULT PRIVILEGES.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC globally by default.
-- A schema-scoped REVOKE cannot subtract a global default grant, so revoke it
-- globally for functions created by postgres. Existing functions are unaffected.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Public API functions and sequences are opt-in. Grant only the exact roles
-- required by each newly created function/sequence in its own migration.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

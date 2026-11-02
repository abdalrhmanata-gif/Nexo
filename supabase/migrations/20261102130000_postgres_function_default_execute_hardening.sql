-- Prevent future postgres-owned functions from inheriting EXECUTE by PUBLIC.
-- Public-schema function grants are opt-in and must be explicit per function.
-- This affects future functions only; existing function ACLs are unchanged.
--
-- The global PUBLIC revoke is required because PostgreSQL schema-scoped default
-- privileges can add grants but cannot subtract the global PUBLIC EXECUTE default.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Remove Supabase role defaults for new functions in the application API schema.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- W85: add a deny-by-default RLS backstop to server-only anonymous AI quota state.
-- Access remains exclusively through service_role EXECUTE on the narrow public
-- SECURITY INVOKER wrappers, which delegate to postgres-owned SECURITY DEFINER helpers.
-- No permissive table policies are created.

alter table private.anonymous_ai_visitors enable row level security;
alter table private.anonymous_ai_ip_windows enable row level security;
alter table private.anonymous_ai_reservations enable row level security;

-- The quota helpers execute as their trusted postgres owner. API roles must
-- never need or receive direct table privileges, including service_role.
revoke all privileges on table private.anonymous_ai_visitors
  from public, anon, authenticated, service_role;
revoke all privileges on table private.anonymous_ai_ip_windows
  from public, anon, authenticated, service_role;
revoke all privileges on table private.anonymous_ai_reservations
  from public, anon, authenticated, service_role;

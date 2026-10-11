-- W65: agent execution rows are writable only through guarded RPCs.
-- RLS does not protect against TRUNCATE, so remove all direct table privileges
-- from public/anon/authenticated and grant back read-only access to members.
revoke all privileges on table public.agent_executions from public, anon, authenticated;

grant select on table public.agent_executions to authenticated;
grant all privileges on table public.agent_executions to service_role;

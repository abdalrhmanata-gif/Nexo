-- W67: fail closed on the legacy user-callable Research completion contract.
-- Revoke all application/trusted API-role access immediately after W66, before
-- the later budget/JIT migrations. W79 will remove these six-argument overloads
-- and install the requester-bound seven-argument trusted completion boundary.
-- This intentionally disables hosted Research during an incomplete rollout.
revoke all on function public.complete_read_only_research_execution(uuid, text, jsonb, jsonb, text, text)
  from public, anon, authenticated, service_role;

revoke all on function private.complete_read_only_research_execution(uuid, text, jsonb, jsonb, text, text)
  from public, anon, authenticated, service_role;

-- Forward-only security follow-up after hosted W86.
-- Historical W38/W39/W44/W55/W80 migrations remain byte-for-byte unchanged.
-- Preserve service_role DML until every server-side dependency is independently reviewed.

revoke truncate, references, trigger, maintain on table
  public.workspace_members, public.workspace_agents, public.mission_approvals,
  public.workspace_invitations, public.product_growth_events
from authenticated;

revoke delete on table public.workspace_invitations from authenticated;
revoke update, delete on table public.product_growth_events from authenticated;

revoke truncate, references, trigger, maintain on table
  public.ai_entitlements, public.ai_usage_monthly, public.ai_usage_reservations,
  public.mission_actions, public.mission_approvals, public.mission_events,
  public.mission_outcomes, public.mission_verifications, public.missions,
  public.product_growth_events, public.profiles, public.workspace_activity,
  public.workspace_agents, public.workspace_invitations, public.workspace_members,
  public.workspaces
from service_role;

-- App migrations create public tables as postgres. Remove anon defaults and
-- unnecessary structural privileges without changing existing DML defaults.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from authenticated, service_role;

-- Anonymous lookup crosses the private-schema boundary only through this
-- narrow token-hash wrapper. Callers get no private-schema USAGE or helper EXECUTE.
create or replace function public.get_workspace_invitation(p_token_hash text)
returns table(
  id uuid, email text, role text, status text,
  expires_at timestamptz, created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select * from private.get_workspace_invitation(p_token_hash);
$function$;

revoke all on function public.get_workspace_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_workspace_invitation(text)
  to anon, authenticated;
revoke all on function private.get_workspace_invitation(text)
  from public, anon, authenticated, service_role;

-- Mutation wrappers stay SECURITY INVOKER; their guarded private helpers are
-- callable by authenticated only. service_role is not a supported caller.
revoke all on function public.create_workspace_invitation(uuid,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_workspace_invitation(uuid,text,text,text,timestamptz)
  to authenticated;
revoke all on function public.accept_workspace_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_workspace_invitation(text)
  to authenticated;
revoke all on function public.revoke_workspace_invitation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_workspace_invitation(uuid)
  to authenticated;

revoke all on function private.create_workspace_invitation(uuid,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.create_workspace_invitation(uuid,text,text,text,timestamptz)
  to authenticated;
revoke all on function private.accept_workspace_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function private.accept_workspace_invitation(text)
  to authenticated;
revoke all on function private.revoke_workspace_invitation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.revoke_workspace_invitation(uuid)
  to authenticated;

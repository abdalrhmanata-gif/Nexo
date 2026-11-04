-- Keep workspace membership writes behind the guarded RPC boundary.
-- Direct table DML bypasses the last-owner protections and activity recording
-- enforced by private.update_workspace_member_role/remove_workspace_member.
-- Workspace bootstrap and invitation acceptance continue through SECURITY DEFINER
-- routines; authenticated callers retain SELECT and the guarded RPC entry points.

revoke insert, update, delete on table public.workspace_members
  from authenticated;

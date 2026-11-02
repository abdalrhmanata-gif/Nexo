-- Enforce invitation lifecycle mutations exclusively through the guarded RPC boundary.
-- The public wrappers are SECURITY INVOKER and call authenticated-executable,
-- postgres-owned SECURITY DEFINER helpers. Direct table writes bypass their
-- authorization, token validation, expiry, and workspace activity/audit checks.

revoke insert, update, delete on table public.workspace_invitations
  from authenticated;

-- Table-level REVOKE does not remove separately granted column privileges.
revoke insert (
  id, workspace_id, email, role, invited_by, status, token_hash,
  expires_at, created_at, accepted_at
), update (
  id, workspace_id, email, role, invited_by, status, token_hash,
  expires_at, created_at, accepted_at
) on table public.workspace_invitations
  from authenticated;

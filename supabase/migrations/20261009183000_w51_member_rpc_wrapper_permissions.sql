-- W51 fixes the W45 mismatch between public SECURITY INVOKER RPC wrappers
-- and their private SECURITY DEFINER implementations. The wrapper is the
-- PostgREST API boundary; its invoker needs EXECUTE on the private helper.
-- The private schema is not part of the exposed PostgREST schema, and every
-- helper performs its own auth.uid()/workspace-role authorization check.
-- Preserve deny-by-default for anon and PUBLIC.

revoke all on function private.list_workspace_members(uuid) from public, anon, authenticated;
grant execute on function private.list_workspace_members(uuid) to authenticated;

revoke all on function private.update_workspace_member_role(uuid, text) from public, anon, authenticated;
grant execute on function private.update_workspace_member_role(uuid, text) to authenticated;

revoke all on function private.remove_workspace_member(uuid) from public, anon, authenticated;
grant execute on function private.remove_workspace_member(uuid) to authenticated;

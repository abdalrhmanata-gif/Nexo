-- Close direct workspace-ownership takeover.
--
-- Proven on PostgreSQL as the `authenticated` role, against this project's own
-- migration chain:
--
--   1. w4 granted table-level UPDATE on public.workspaces to `authenticated`.
--   2. workspaces_update_admin (w39, consolidated in w54) checks only that the
--      caller is owner or admin. Neither USING nor WITH CHECK mentions
--      owner_id, and RLS cannot compare a row's old and new values anyway.
--   3. So an admin could run
--        update public.workspaces set owner_id = auth.uid() where id = :ws
--      and it succeeded.
--
-- What that bought the admin was not a title. workspaces_delete_owner permits
-- DELETE where owner_id = auth.uid(), so after the write the admin could
-- delete the workspace and the rightful owner could not: measured as 1 and 0
-- respectively in the regression proof.
--
-- The self-promotion half of the original report did not reproduce.
-- `authenticated` holds only SELECT on public.workspace_members, so the direct
-- membership write fails on privilege, and the w45 functions decide promotion
-- from private.workspace_role() rather than from workspaces.owner_id. The
-- owner_id-trusting policies on workspace_members are unreachable today for
-- the same reason — but they are a loaded trap: one future grant of INSERT or
-- UPDATE on that table would open the whole chain. Fixing owner_id now
-- disarms it in advance.
--
-- The fix is a privilege, not a policy. Column-level UPDATE cannot be
-- sidestepped by a later policy edit, and it fails closed: a column added to
-- this table in future is not writable by `authenticated` until someone grants
-- it deliberately.
--
-- Scope check before narrowing: no migration and no application code in this
-- repository issues UPDATE against public.workspaces. `name` is the only
-- column a workspace admin could plausibly need to change, and updated_at is
-- maintained by the workspaces_set_updated_at trigger, which runs with the
-- table owner's rights and needs no grant.
--
-- Ownership transfer is deliberately NOT introduced here. The product supports
-- no such operation today — no function, no endpoint, no interface — and
-- adding an unused SECURITY DEFINER path to satisfy a symmetry nobody has
-- asked for would widen the attack surface this migration exists to narrow.
-- When transfer is needed it belongs in its own migration, owner-authorised,
-- with its own tests.

revoke update on table public.workspaces from authenticated;
grant update (name) on table public.workspaces to authenticated;

comment on column public.workspaces.owner_id is
  'Not writable by the authenticated role. See 20261106130000_w99_workspace_owner_column_privilege.sql: a column-level grant, so that an admin cannot take ownership through a direct table write.';

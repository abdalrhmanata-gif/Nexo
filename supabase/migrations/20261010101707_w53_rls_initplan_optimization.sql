-- W53 applies Supabase's scalar-subquery optimization to auth.uid() calls
-- flagged by the Development Performance Advisor. Authorization predicates,
-- policy roles, commands, and non-auth checks remain unchanged.
alter policy agent_executions_editor_insert
  on public.agent_executions
  with check (
    private.can_edit_workspace(workspace_id)
    and requested_by = (select auth.uid())
  );

alter policy mission_approvals_member_insert
  on public.mission_approvals
  with check (
    private.is_workspace_member(workspace_id)
    and requested_by = (select auth.uid())
  );

alter policy missions_insert_member
  on public.missions
  with check (
    owner_id = (select auth.uid())
    and private.can_edit_workspace(workspace_id)
  );

alter policy workspace_invitations_owner_insert
  on public.workspace_invitations
  with check (
    private.workspace_role(workspace_id) in ('owner', 'admin')
    and invited_by = (select auth.uid())
  );

alter policy workspace_members_owner_manage
  on public.workspace_members
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = (select auth.uid())
    )
  );

alter policy workspaces_delete_owner
  on public.workspaces
  using (owner_id = (select auth.uid()));

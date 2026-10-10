-- W54 removes duplicated permissive SELECT policy paths without broadening
-- access. The admin-only SELECT path on workspace_agents was already a subset
-- of workspace membership; workspace_members keeps the exact OR of member
-- visibility and the workspace-owner visibility that the old ALL policy gave.
-- All application-facing policies are limited to authenticated users.

drop policy if exists workspace_agents_admin_manage on public.workspace_agents;

alter policy workspace_agents_member_select
  on public.workspace_agents
  to authenticated;

create policy workspace_agents_admin_insert
  on public.workspace_agents
  for insert
  to authenticated
  with check (private.workspace_role(workspace_id) in ('owner', 'admin'));

create policy workspace_agents_admin_update
  on public.workspace_agents
  for update
  to authenticated
  using (private.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (private.workspace_role(workspace_id) in ('owner', 'admin'));

create policy workspace_agents_admin_delete
  on public.workspace_agents
  for delete
  to authenticated
  using (private.workspace_role(workspace_id) in ('owner', 'admin'));

drop policy if exists workspace_members_owner_manage on public.workspace_members;

alter policy workspace_members_select_member
  on public.workspace_members
  to authenticated
  using (
    private.is_workspace_member(workspace_id)
    or exists (
      select 1
      from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = (select auth.uid())
    )
  );

create policy workspace_members_owner_insert
  on public.workspace_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = (select auth.uid())
    )
  );

create policy workspace_members_owner_update
  on public.workspace_members
  for update
  to authenticated
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

create policy workspace_members_owner_delete
  on public.workspace_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = (select auth.uid())
    )
  );

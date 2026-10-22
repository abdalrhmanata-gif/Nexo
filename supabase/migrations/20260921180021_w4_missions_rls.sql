alter table public.missions enable row level security;

create policy missions_select_own on public.missions
for select to authenticated
using (
  owner_id = auth.uid()
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = auth.uid()
  )
);

create policy missions_insert_own on public.missions
for insert to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = auth.uid()
  )
);

create policy missions_update_own on public.missions
for update to authenticated
using (
  owner_id = auth.uid()
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = auth.uid()
  )
)
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = auth.uid()
  )
);

create policy missions_delete_own on public.missions
for delete to authenticated
using (
  owner_id = auth.uid()
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = auth.uid()
  )
);

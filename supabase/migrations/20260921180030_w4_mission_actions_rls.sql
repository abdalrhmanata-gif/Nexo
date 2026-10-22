alter table public.mission_actions enable row level security;

create policy mission_actions_select_own on public.mission_actions
for select to authenticated
using (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = auth.uid()
      and w.owner_id = auth.uid()
  )
);

create policy mission_actions_insert_own on public.mission_actions
for insert to authenticated
with check (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = auth.uid()
      and w.owner_id = auth.uid()
  )
);

create policy mission_actions_update_own on public.mission_actions
for update to authenticated
using (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = auth.uid()
      and w.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = auth.uid()
      and w.owner_id = auth.uid()
  )
);

create policy mission_actions_delete_own on public.mission_actions
for delete to authenticated
using (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = auth.uid()
      and w.owner_id = auth.uid()
  )
);

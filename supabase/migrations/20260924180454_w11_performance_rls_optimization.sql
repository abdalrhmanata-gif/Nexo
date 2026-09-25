create index if not exists mission_events_actor_id_idx
  on public.mission_events(actor_id);

create index if not exists mission_verifications_owner_id_idx
  on public.mission_verifications(owner_id);

create index if not exists mission_outcomes_owner_id_idx
  on public.mission_outcomes(owner_id);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own on public.workspaces
for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists workspaces_insert_own on public.workspaces;
create policy workspaces_insert_own on public.workspaces
for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists workspaces_update_own on public.workspaces;
create policy workspaces_update_own on public.workspaces
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists workspaces_delete_own on public.workspaces;
create policy workspaces_delete_own on public.workspaces
for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists missions_select_own on public.missions;
create policy missions_select_own on public.missions
for select to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = (select auth.uid())
  )
);

drop policy if exists missions_insert_own on public.missions;
create policy missions_insert_own on public.missions
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = (select auth.uid())
  )
);

drop policy if exists missions_update_own on public.missions;
create policy missions_update_own on public.missions
for update to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = (select auth.uid())
  )
);

drop policy if exists missions_delete_own on public.missions;
create policy missions_delete_own on public.missions
for delete to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.workspaces w
    where w.id = missions.workspace_id and w.owner_id = (select auth.uid())
  )
);

drop policy if exists mission_actions_select_own on public.mission_actions;
create policy mission_actions_select_own on public.mission_actions
for select to authenticated
using (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = (select auth.uid())
      and w.owner_id = (select auth.uid())
  )
);

drop policy if exists mission_actions_insert_own on public.mission_actions;
create policy mission_actions_insert_own on public.mission_actions
for insert to authenticated
with check (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = (select auth.uid())
      and w.owner_id = (select auth.uid())
  )
);

drop policy if exists mission_actions_update_own on public.mission_actions;
create policy mission_actions_update_own on public.mission_actions
for update to authenticated
using (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = (select auth.uid())
      and w.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = (select auth.uid())
      and w.owner_id = (select auth.uid())
  )
);

drop policy if exists mission_actions_delete_own on public.mission_actions;
create policy mission_actions_delete_own on public.mission_actions
for delete to authenticated
using (
  exists (
    select 1
    from public.missions m
    join public.workspaces w on w.id = m.workspace_id
    where m.id = mission_actions.mission_id
      and m.owner_id = (select auth.uid())
      and w.owner_id = (select auth.uid())
  )
);

drop policy if exists mission_events_select_own on public.mission_events;
create policy mission_events_select_own on public.mission_events
for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists mission_verifications_select_own on public.mission_verifications;
create policy mission_verifications_select_own on public.mission_verifications
for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists mission_outcomes_select_own on public.mission_outcomes;
create policy mission_outcomes_select_own on public.mission_outcomes
for select to authenticated
using (owner_id = (select auth.uid()));

alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles
for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.workspaces enable row level security;
create policy workspaces_select_own on public.workspaces
for select to authenticated using (owner_id = auth.uid());
create policy workspaces_insert_own on public.workspaces
for insert to authenticated with check (owner_id = auth.uid());
create policy workspaces_update_own on public.workspaces
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy workspaces_delete_own on public.workspaces
for delete to authenticated using (owner_id = auth.uid());

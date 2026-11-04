revoke all privileges on table public.profiles, public.workspaces, public.missions, public.mission_actions from anon;
revoke all privileges on table public.profiles, public.workspaces, public.missions, public.mission_actions from authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.missions to authenticated;
grant select, insert, update, delete on table public.mission_actions to authenticated;

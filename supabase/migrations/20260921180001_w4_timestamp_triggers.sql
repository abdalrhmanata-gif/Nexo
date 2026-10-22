create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $body$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$body$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function private.set_updated_at();

create trigger missions_set_updated_at
before update on public.missions
for each row execute function private.set_updated_at();

create trigger mission_actions_set_updated_at
before update on public.mission_actions
for each row execute function private.set_updated_at();

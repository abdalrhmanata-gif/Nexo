create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $body$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$body$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user_profile();

revoke all privileges on function private.handle_new_user_profile() from public, anon, authenticated;

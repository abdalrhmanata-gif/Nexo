alter table public.mission_events
  drop constraint if exists mission_events_mission_id_fkey;

alter table public.mission_events
  add constraint mission_events_mission_id_fkey
  foreign key (mission_id)
  references public.missions(id)
  on delete restrict;

create or replace function public.prevent_action_delete_with_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.mission_events
     where mission_id = old.mission_id
       and event_type = 'ACTION_STATUS_TRANSITION'
       and payload ->> 'action_id' = old.id::text
  ) then
    raise exception 'ACTION_DELETE_FORBIDDEN_HISTORY'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists mission_action_history_delete_guard on public.mission_actions;
create trigger mission_action_history_delete_guard
before delete on public.mission_actions
for each row
execute function public.prevent_action_delete_with_history();

revoke all on function public.prevent_action_delete_with_history() from public, anon, authenticated;

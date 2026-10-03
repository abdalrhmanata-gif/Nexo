create schema if not exists private;

create or replace function private.block_mission_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '42501', message = 'Mission history is append-only';
end;
$$;

revoke all on function private.block_mission_history_mutation() from public;

drop trigger if exists mission_events_append_only on public.mission_events;
create trigger mission_events_append_only
before delete or update on public.mission_events
for each row execute function private.block_mission_history_mutation();

drop trigger if exists mission_verifications_append_only on public.mission_verifications;
create trigger mission_verifications_append_only
before delete or update on public.mission_verifications
for each row execute function private.block_mission_history_mutation();

drop trigger if exists mission_outcomes_append_only on public.mission_outcomes;
create trigger mission_outcomes_append_only
before delete or update on public.mission_outcomes
for each row execute function private.block_mission_history_mutation();

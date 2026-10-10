-- W37: keep the mission-history RPC behind the same private implementation boundary
-- as the other authenticated mission mutation commands.
create schema if not exists private;

alter function public.record_mission_event(uuid, text, jsonb) set schema private;

create function public.record_mission_event(
  p_mission_id uuid, p_event_type text, p_payload jsonb
)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $function$
  select private.record_mission_event(p_mission_id, p_event_type, p_payload);
$function$;

revoke all on function public.record_mission_event(uuid, text, jsonb) from public, anon;
grant execute on function public.record_mission_event(uuid, text, jsonb) to authenticated;

revoke all on function private.record_mission_event(uuid, text, jsonb) from public, anon;
grant execute on function private.record_mission_event(uuid, text, jsonb) to authenticated;

revoke all on schema private from public;
grant usage on schema private to authenticated;

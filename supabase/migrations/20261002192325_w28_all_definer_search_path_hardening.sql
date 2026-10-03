-- W28: normalize remaining SECURITY DEFINER functions with unsafe schema ordering.
-- Keep trusted PostgreSQL built-ins first and preserve existing migration history.
alter function public.create_mission_with_actions(uuid, text, jsonb)
  set search_path = pg_catalog, public;

alter function public.handle_new_user_profile()
  set search_path = pg_catalog, public;

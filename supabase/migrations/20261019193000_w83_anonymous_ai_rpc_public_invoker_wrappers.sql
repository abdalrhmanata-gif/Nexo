-- Expose only narrow, server-only invoker wrappers for the anonymous AI quota guard.
-- The state tables and SECURITY DEFINER implementation helpers remain in unexposed schema private.
-- The Supabase backend secret key maps to service_role via the apikey header; no Bearer JWT is assumed.

revoke all on function private.reserve_anonymous_ai_generation(text, text, uuid)
  from public, anon, authenticated;
revoke all on function private.consume_anonymous_ai_generation(uuid)
  from public, anon, authenticated;
revoke all on function private.release_anonymous_ai_generation(uuid)
  from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.reserve_anonymous_ai_generation(text, text, uuid) to service_role;
grant execute on function private.consume_anonymous_ai_generation(uuid) to service_role;
grant execute on function private.release_anonymous_ai_generation(uuid) to service_role;

create or replace function public.reserve_anonymous_ai_generation(
  p_visitor_hash text,
  p_ip_hash text,
  p_request_id uuid
)
returns table (
  allowed boolean,
  reservation_id uuid,
  remaining integer,
  reason text
)
language sql
security invoker
set search_path = pg_catalog
as $function$
  select *
  from private.reserve_anonymous_ai_generation($1, $2, $3);
$function$;

create or replace function public.consume_anonymous_ai_generation(
  p_reservation_id uuid
)
returns boolean
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.consume_anonymous_ai_generation($1);
$function$;

create or replace function public.release_anonymous_ai_generation(
  p_reservation_id uuid
)
returns boolean
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.release_anonymous_ai_generation($1);
$function$;

revoke all on function public.reserve_anonymous_ai_generation(text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_anonymous_ai_generation(uuid)
  from public, anon, authenticated;
revoke all on function public.release_anonymous_ai_generation(uuid)
  from public, anon, authenticated;

grant execute on function public.reserve_anonymous_ai_generation(text, text, uuid) to service_role;
grant execute on function public.consume_anonymous_ai_generation(uuid) to service_role;
grant execute on function public.release_anonymous_ai_generation(uuid) to service_role;

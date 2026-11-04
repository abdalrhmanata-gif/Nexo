-- W32: keep public RPC boundaries as SECURITY INVOKER and move privileged implementations
-- to the non-exposed private schema. This removes the Security Advisor 0029 warning
-- without revoking the authenticated RPC API used by the application.

create schema if not exists private;

alter function public.commit_verified_mission_outcome(uuid, uuid, jsonb, numeric, text) set schema private;
alter function public.consume_ai_generation(uuid) set schema private;
alter function public.create_mission_verification(uuid, text, jsonb, jsonb, numeric, text) set schema private;
alter function public.create_mission_with_actions(uuid, text, jsonb) set schema private;
alter function public.get_ai_usage() set schema private;
alter function public.release_ai_generation(uuid) set schema private;
alter function public.reserve_ai_generation(text) set schema private;
alter function public.transition_mission(uuid, text, bigint) set schema private;
alter function public.transition_mission_action(uuid, text, bigint, timestamptz, boolean) set schema private;
alter function public.update_mission_details(uuid, text, bigint) set schema private;

create function public.commit_verified_mission_outcome(
  p_mission_id uuid, p_verification_id uuid, p_result jsonb,
  p_success_score numeric default 1, p_status text default 'COMPLETED'
)
returns public.mission_outcomes language sql security invoker
set search_path = pg_catalog, public
as $function$
  select private.commit_verified_mission_outcome(
    p_mission_id, p_verification_id, p_result, p_success_score, p_status
  );
$function$;

create function public.consume_ai_generation(p_reservation_id uuid)
returns boolean language sql security invoker
set search_path = pg_catalog, public
as $function$
  select private.consume_ai_generation(p_reservation_id);
$function$;

create function public.create_mission_verification(
  p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb,
  p_confidence numeric default null, p_failure_reason text default null
)
returns public.mission_verifications language sql security invoker
set search_path = pg_catalog, public
as $function$
  select private.create_mission_verification(
    p_mission_id, p_status, p_criteria, p_evidence, p_confidence, p_failure_reason
  );
$function$;

create function public.create_mission_with_actions(
  p_workspace_id uuid, p_objective text, p_actions jsonb default '[]'::jsonb
)
returns public.missions language sql security invoker
set search_path = pg_catalog, public
as $function$
  select private.create_mission_with_actions(p_workspace_id, p_objective, p_actions);
$function$;

create function public.get_ai_usage()
returns table(
  period_start date,
  plan text,
  monthly_limit integer,
  generations_used integer,
  remaining integer
)
language sql security invoker
set search_path = pg_catalog, public
as $function$
  select * from private.get_ai_usage();
$function$;

create function public.release_ai_generation(p_reservation_id uuid)
returns boolean language sql security invoker
set search_path = pg_catalog, public
as $function$
  select private.release_ai_generation(p_reservation_id);
$function$;

create function public.reserve_ai_generation(p_request_id text)
returns table(
  allowed boolean,
  reservation_id uuid,
  period_start date,
  plan text,
  monthly_limit integer,
  generations_used integer,
  remaining integer
)
language sql security invoker
set search_path = pg_catalog, public
as $function$
  select * from private.reserve_ai_generation(p_request_id);
$function$;

create function public.transition_mission(
  p_mission_id uuid, p_to_status text, p_expected_version bigint
)
returns public.missions language sql security invoker
set search_path = pg_catalog, public
as $function$
  select private.transition_mission(p_mission_id, p_to_status, p_expected_version);
$function$;

create function public.transition_mission_action(
  p_action_id uuid, p_to_status text, p_expected_version bigint,
  p_follow_up_at timestamptz default null, p_set_follow_up boolean default false
)
returns public.mission_actions language sql security invoker
set search_path = pg_catalog, public
as $function$
  select private.transition_mission_action(
    p_action_id, p_to_status, p_expected_version, p_follow_up_at, p_set_follow_up
  );
$function$;

create function public.update_mission_details(
  p_mission_id uuid, p_objective text, p_expected_version bigint
)
returns public.missions language sql security invoker
set search_path = pg_catalog, public
as $function$
  select private.update_mission_details(p_mission_id, p_objective, p_expected_version);
$function$;

revoke all on function public.commit_verified_mission_outcome(uuid, uuid, jsonb, numeric, text) from public, anon;
grant execute on function public.commit_verified_mission_outcome(uuid, uuid, jsonb, numeric, text) to authenticated;
revoke all on function public.consume_ai_generation(uuid) from public, anon;
grant execute on function public.consume_ai_generation(uuid) to authenticated;
revoke all on function public.create_mission_verification(uuid, text, jsonb, jsonb, numeric, text) from public, anon;
grant execute on function public.create_mission_verification(uuid, text, jsonb, jsonb, numeric, text) to authenticated;
revoke all on function public.create_mission_with_actions(uuid, text, jsonb) from public, anon;
grant execute on function public.create_mission_with_actions(uuid, text, jsonb) to authenticated;
revoke all on function public.get_ai_usage() from public, anon;
grant execute on function public.get_ai_usage() to authenticated;
revoke all on function public.release_ai_generation(uuid) from public, anon;
grant execute on function public.release_ai_generation(uuid) to authenticated;
revoke all on function public.reserve_ai_generation(text) from public, anon;
grant execute on function public.reserve_ai_generation(text) to authenticated;
revoke all on function public.transition_mission(uuid, text, bigint) from public, anon;
grant execute on function public.transition_mission(uuid, text, bigint) to authenticated;
revoke all on function public.transition_mission_action(uuid, text, bigint, timestamptz, boolean) from public, anon;
grant execute on function public.transition_mission_action(uuid, text, bigint, timestamptz, boolean) to authenticated;
revoke all on function public.update_mission_details(uuid, text, bigint) from public, anon;
grant execute on function public.update_mission_details(uuid, text, bigint) to authenticated;

revoke all on function private.commit_verified_mission_outcome(uuid, uuid, jsonb, numeric, text) from public, anon;
grant execute on function private.commit_verified_mission_outcome(uuid, uuid, jsonb, numeric, text) to authenticated;
revoke all on function private.consume_ai_generation(uuid) from public, anon;
grant execute on function private.consume_ai_generation(uuid) to authenticated;
revoke all on function private.create_mission_verification(uuid, text, jsonb, jsonb, numeric, text) from public, anon;
grant execute on function private.create_mission_verification(uuid, text, jsonb, jsonb, numeric, text) to authenticated;
revoke all on function private.create_mission_with_actions(uuid, text, jsonb) from public, anon;
grant execute on function private.create_mission_with_actions(uuid, text, jsonb) to authenticated;
revoke all on function private.get_ai_usage() from public, anon;
grant execute on function private.get_ai_usage() to authenticated;
revoke all on function private.release_ai_generation(uuid) from public, anon;
grant execute on function private.release_ai_generation(uuid) to authenticated;
revoke all on function private.reserve_ai_generation(text) from public, anon;
grant execute on function private.reserve_ai_generation(text) to authenticated;
revoke all on function private.transition_mission(uuid, text, bigint) from public, anon;
grant execute on function private.transition_mission(uuid, text, bigint) to authenticated;
revoke all on function private.transition_mission_action(uuid, text, bigint, timestamptz, boolean) from public, anon;
grant execute on function private.transition_mission_action(uuid, text, bigint, timestamptz, boolean) to authenticated;
revoke all on function private.update_mission_details(uuid, text, bigint) from public, anon;
grant execute on function private.update_mission_details(uuid, text, bigint) to authenticated;

revoke all on schema private from public;
grant usage on schema private to authenticated;

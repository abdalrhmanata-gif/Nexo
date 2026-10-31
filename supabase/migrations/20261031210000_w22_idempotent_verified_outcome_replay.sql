-- W22 — a verified outcome remains idempotently readable after completion.
--
-- The mission row is locked before the verification/outcome lookup, serializing
-- concurrent commits for the same mission. An existing outcome is returned
-- before checking whether the mission is still VERIFYING. This preserves the
-- committed result on retries after the first request transitioned the mission
-- to COMPLETED or FAILED, without inserting a second outcome or event.
--
-- Authentication, workspace ownership, verification ownership-by-mission,
-- VERIFIED status, action completion rules, transition checks and append-only
-- event recording remain unchanged.

create or replace function private.commit_verified_mission_outcome(
  p_mission_id uuid,
  p_verification_id uuid,
  p_result jsonb,
  p_success_score numeric default 1,
  p_status text default 'COMPLETED'
)
returns public.mission_outcomes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mission public.missions;
  v_verification public.mission_verifications;
  v_outcome public.mission_outcomes;
  v_should_complete boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'INVALID_OUTCOME_RESULT' using errcode = '22023';
  end if;

  if p_success_score is null or p_success_score < 0 or p_success_score > 1 then
    raise exception 'INVALID_OUTCOME_SCORE' using errcode = '22023';
  end if;

  if p_status not in ('COMPLETED', 'FAILED') then
    raise exception 'INVALID_OUTCOME_STATUS' using errcode = '22023';
  end if;

  select *
    into v_mission
    from public.missions
   where id = p_mission_id
   for update;

  if not found
     or not private.can_edit_workspace(v_mission.workspace_id, auth.uid()) then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_verification
    from public.mission_verifications
   where id = p_verification_id
     and mission_id = p_mission_id
   for update;

  if not found then
    raise exception 'VERIFICATION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if v_verification.status <> 'VERIFIED' then
    raise exception 'VERIFICATION_NOT_VERIFIED' using errcode = '22023';
  end if;

  -- Idempotency check must precede the lifecycle-state check. A retry after
  -- the first commit sees COMPLETED/FAILED, but must return that same record.
  select *
    into v_outcome
    from public.mission_outcomes
   where verification_id = p_verification_id
     and mission_id = p_mission_id
   for update;

  if found then
    return v_outcome;
  end if;

  if v_mission.status <> 'VERIFYING' then
    raise exception 'MISSION_NOT_VERIFYING' using errcode = '22023';
  end if;

  if p_status = 'COMPLETED'
     and exists (
       select 1
         from public.mission_actions
        where mission_id = v_mission.id
          and status not in ('COMPLETED', 'CANCELLED')
     ) then
    raise exception 'ALL_ACTIONS_MUST_BE_COMPLETED' using errcode = '22023';
  end if;

  v_should_complete := p_status = 'COMPLETED';

  insert into public.mission_outcomes (
    mission_id,
    owner_id,
    verification_id,
    status,
    result,
    success_score,
    verified
  ) values (
    v_mission.id,
    v_mission.owner_id,
    v_verification.id,
    p_status,
    p_result,
    p_success_score,
    true
  )
  returning * into v_outcome;

  perform public.transition_mission(
    v_mission.id,
    p_status,
    v_mission.version
  );

  perform public.record_mission_event(
    v_mission.id,
    'OUTCOME_COMMITTED',
    jsonb_build_object(
      'outcome_id', v_outcome.id,
      'verification_id', v_verification.id,
      'status', v_outcome.status,
      'success_score', v_outcome.success_score,
      'mission_completed', v_should_complete,
      'recorded_by', auth.uid()
    )
  );

  return v_outcome;
end;
$$;

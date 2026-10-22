create or replace function public.create_mission_verification(
  p_mission_id uuid,
  p_status text,
  p_criteria jsonb,
  p_evidence jsonb,
  p_confidence numeric default null,
  p_failure_reason text default null
)
returns public.mission_verifications
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mission public.missions;
  v_verification public.mission_verifications;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_status not in ('VERIFIED', 'FAILED') then
    raise exception 'INVALID_VERIFICATION_STATUS' using errcode = '22023';
  end if;

  if p_criteria is null or jsonb_typeof(p_criteria) <> 'object'
     or p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'INVALID_VERIFICATION_PAYLOAD' using errcode = '22023';
  end if;

  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then
    raise exception 'INVALID_VERIFICATION_CONFIDENCE' using errcode = '22023';
  end if;

  select *
    into v_mission
    from public.missions
   where id = p_mission_id
   for update;

  if not found or v_mission.owner_id <> auth.uid() then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if v_mission.status <> 'VERIFYING' then
    raise exception 'MISSION_NOT_VERIFYING' using errcode = '22023';
  end if;

  insert into public.mission_verifications (
    mission_id,
    owner_id,
    status,
    criteria,
    evidence,
    confidence,
    failure_reason,
    resolved_at
  ) values (
    v_mission.id,
    v_mission.owner_id,
    p_status,
    p_criteria,
    p_evidence,
    p_confidence,
    p_failure_reason,
    timezone('utc', now())
  )
  returning * into v_verification;

  perform public.record_mission_event(
    v_mission.id,
    'VERIFICATION_RECORDED',
    jsonb_build_object(
      'verification_id', v_verification.id,
      'status', v_verification.status,
      'confidence', v_verification.confidence
    )
  );

  return v_verification;
end;
$$;

create or replace function public.commit_verified_mission_outcome(
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
  v_target_status text;
  v_should_transition boolean;
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

  if not found or v_mission.owner_id <> auth.uid() then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_verification
    from public.mission_verifications
   where id = p_verification_id
     and mission_id = p_mission_id
     and owner_id = auth.uid()
   for update;

  if not found then
    raise exception 'VERIFICATION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if v_verification.status <> 'VERIFIED' then
    raise exception 'VERIFICATION_NOT_VERIFIED' using errcode = '22023';
  end if;

  select *
    into v_outcome
    from public.mission_outcomes
   where verification_id = p_verification_id
   for update;

  if found then
    return v_outcome;
  end if;

  v_target_status := p_status;
  if v_mission.status <> 'VERIFYING' then
    raise exception 'MISSION_NOT_VERIFYING' using errcode = '22023';
  end if;
  v_should_complete := v_target_status = 'COMPLETED'
    and not exists (
      select 1
        from public.mission_actions
       where mission_id = v_mission.id
         and status <> 'COMPLETED'
    );
  v_should_transition := v_target_status = 'FAILED' or v_should_complete;

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
    v_target_status,
    p_result,
    p_success_score,
    true
  )
  returning * into v_outcome;

  if v_should_transition then
    perform public.transition_mission(
      v_mission.id,
      v_target_status,
      v_mission.version
    );
  end if;

  perform public.record_mission_event(
    v_mission.id,
    'OUTCOME_COMMITTED',
    jsonb_build_object(
      'outcome_id', v_outcome.id,
      'verification_id', v_verification.id,
      'status', v_outcome.status,
      'success_score', v_outcome.success_score,
      'mission_completed', v_should_complete
    )
  );

  return v_outcome;
end;
$$;

revoke all on function public.create_mission_verification(uuid, text, jsonb, jsonb, numeric, text)
  from public, anon;
revoke all on function public.commit_verified_mission_outcome(uuid, uuid, jsonb, numeric, text)
  from public, anon;
grant execute on function public.create_mission_verification(uuid, text, jsonb, jsonb, numeric, text)
  to authenticated;
grant execute on function public.commit_verified_mission_outcome(uuid, uuid, jsonb, numeric, text)
  to authenticated;

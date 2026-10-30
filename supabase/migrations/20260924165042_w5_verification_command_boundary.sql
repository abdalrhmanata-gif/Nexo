create or replace function public.record_mission_event(
  p_mission_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select owner_id into v_owner_id
  from public.missions
  where id = p_mission_id
    and owner_id = auth.uid();

  if not found then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.mission_events (
    mission_id, owner_id, event_type, actor_type, actor_id, payload
  )
  values (
    p_mission_id, v_owner_id, p_event_type, 'USER', auth.uid(),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_mission_event(uuid, text, jsonb)
  from public, anon;
grant execute on function public.record_mission_event(uuid, text, jsonb)
  to authenticated;

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

  if p_status not in ('VERIFIED','FAILED') then
    raise exception 'INVALID_VERIFICATION_STATUS' using errcode = '22023';
  end if;

  select * into v_mission
  from public.missions
  where id = p_mission_id for update;

  if not found or v_mission.owner_id <> auth.uid() then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.mission_verifications (
    mission_id, owner_id, status, criteria, evidence, confidence,
    failure_reason, resolved_at
  )
  values (
    v_mission.id, v_mission.owner_id, p_status,
    p_criteria, p_evidence, p_confidence, p_failure_reason,
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

revoke all on function public.create_mission_verification(uuid,text,jsonb,jsonb,numeric,text)
  from public, anon;
grant execute on function public.create_mission_verification(uuid,text,jsonb,jsonb,numeric,text)
  to authenticated;

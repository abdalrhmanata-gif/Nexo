create or replace function public.transition_mission(
  p_mission_id uuid,
  p_to_status text,
  p_expected_version bigint
)
returns public.missions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mission public.missions;
  v_from_status text;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_mission
    from public.missions
   where id = p_mission_id
   for update;

  if not found or v_mission.owner_id <> auth.uid() then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_expected_version is null or p_expected_version < 1
     or p_expected_version <> v_mission.version then
    raise exception 'STALE_VERSION'
      using errcode = 'P0001',
            detail = json_build_object(
              'expected_version', p_expected_version,
              'actual_version', v_mission.version
            )::text;
  end if;

  v_from_status := v_mission.status;
  select exists (
    select 1
      from (values
        ('DRAFT', 'PLANNING'), ('DRAFT', 'CANCELLED'),
        ('PLANNING', 'READY'), ('PLANNING', 'PAUSED'),
        ('PLANNING', 'BLOCKED'), ('PLANNING', 'CANCELLED'),
        ('READY', 'RUNNING'), ('READY', 'PAUSED'),
        ('READY', 'BLOCKED'), ('READY', 'CANCELLED'),
        ('RUNNING', 'WAITING'), ('RUNNING', 'NEEDS_USER'),
        ('RUNNING', 'VERIFYING'), ('RUNNING', 'PAUSED'),
        ('RUNNING', 'BLOCKED'), ('RUNNING', 'FAILED'),
        ('RUNNING', 'CANCELLED'),
        ('WAITING', 'RUNNING'), ('WAITING', 'NEEDS_USER'),
        ('WAITING', 'PAUSED'), ('WAITING', 'BLOCKED'),
        ('WAITING', 'CANCELLED'),
        ('NEEDS_USER', 'RUNNING'), ('NEEDS_USER', 'PAUSED'),
        ('NEEDS_USER', 'BLOCKED'), ('NEEDS_USER', 'CANCELLED'),
        ('VERIFYING', 'COMPLETED'), ('VERIFYING', 'FAILED'),
        ('VERIFYING', 'PAUSED'), ('VERIFYING', 'BLOCKED'),
        ('VERIFYING', 'CANCELLED'),
        ('PAUSED', 'RUNNING'), ('PAUSED', 'CANCELLED'),
        ('BLOCKED', 'PLANNING'), ('BLOCKED', 'READY'),
        ('BLOCKED', 'RUNNING'), ('BLOCKED', 'CANCELLED')
      ) as allowed(from_status, to_status)
     where allowed.from_status = v_from_status
       and allowed.to_status = p_to_status
  ) into v_allowed;

  if not v_allowed then
    raise exception 'INVALID_MISSION_TRANSITION'
      using errcode = '22023',
            detail = json_build_object(
              'from_status', v_from_status,
              'to_status', p_to_status
            )::text;
  end if;

  if p_to_status = 'COMPLETED' then
    if exists (
      select 1 from public.mission_actions
       where mission_id = v_mission.id
         and status not in ('COMPLETED', 'CANCELLED')
    ) then
      raise exception 'ALL_ACTIONS_MUST_BE_COMPLETED' using errcode = '22023';
    end if;

    -- W20 inserts the outcome before calling this function in the same transaction.
    if not exists (
      select 1
        from public.mission_outcomes o
        join public.mission_verifications v on v.id = o.verification_id
       where o.mission_id = v_mission.id
         and o.owner_id = v_mission.owner_id
         and o.status = 'COMPLETED'
         and o.verified is true
         and v.mission_id = v_mission.id
         and v.owner_id = v_mission.owner_id
         and v.status = 'VERIFIED'
    ) then
      raise exception 'VERIFIED_OUTCOME_REQUIRED' using errcode = '22023';
    end if;
  end if;

  update public.missions
     set status = p_to_status,
         version = version + 1
   where id = v_mission.id
  returning * into v_mission;

  perform public.record_mission_event(
    v_mission.id,
    'MISSION_STATUS_TRANSITION',
    jsonb_build_object(
      'from_status', v_from_status,
      'to_status', v_mission.status,
      'version', v_mission.version
    )
  );

  return v_mission;
end;
$$;

revoke all on function public.transition_mission(uuid, text, bigint) from public, anon;
grant execute on function public.transition_mission(uuid, text, bigint) to authenticated;

-- INSERT is public API too. Keep existing ownership policies and restrict initial state.
create policy missions_initial_state on public.missions
as restrictive for insert to authenticated
with check (status = 'DRAFT' and version = 1);

-- Serialize action insertion against completion on the same parent lock.
-- A check without this lock can race the outcome/transition transaction.
create or replace function public.guard_mission_action_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select status into v_status
    from public.missions
   where id = new.mission_id and owner_id = auth.uid()
   for update;
  if not found then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'MISSION_ALREADY_COMPLETED' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_mission_action_insert() from public, anon, authenticated;
create trigger mission_actions_completion_insert_guard
before insert on public.mission_actions
for each row execute function public.guard_mission_action_insert();
create or replace function public.prevent_mission_action_reparent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.mission_id is distinct from old.mission_id then
    raise exception 'ACTION_PARENT_IMMUTABLE' using errcode = '23001';
  end if;

  if not exists (
    select 1
      from public.missions
     where id = new.mission_id
  ) then
    raise exception 'ACTION_PARENT_NOT_FOUND' using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists mission_actions_parent_immutable on public.mission_actions;
create trigger mission_actions_parent_immutable
before update on public.mission_actions
for each row
execute function public.prevent_mission_action_reparent();

revoke all on function public.prevent_mission_action_reparent() from public, anon, authenticated;

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

  select owner_id
    into v_owner_id
    from public.missions
    where id = p_mission_id
      and owner_id = auth.uid();

  if not found then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.mission_events (
    mission_id,
    owner_id,
    event_type,
    actor_type,
    actor_id,
    payload
  ) values (
    p_mission_id,
    v_owner_id,
    p_event_type,
    'USER',
    auth.uid(),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_mission_event(uuid, text, jsonb) from public, anon, authenticated;

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

create or replace function public.update_mission_details(
  p_mission_id uuid,
  p_objective text,
  p_expected_version bigint
)
returns public.missions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mission public.missions;
  v_previous_objective text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_objective is null or char_length(btrim(p_objective)) not between 1 and 10000 then
    raise exception 'INVALID_OBJECTIVE' using errcode = '22023';
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

  v_previous_objective := v_mission.objective;
  update public.missions
     set objective = btrim(p_objective),
         version = version + 1
   where id = v_mission.id
  returning * into v_mission;

  perform public.record_mission_event(
    v_mission.id,
    'MISSION_OBJECTIVE_UPDATED',
    jsonb_build_object(
      'previous_objective', v_previous_objective,
      'objective', v_mission.objective,
      'version', v_mission.version
    )
  );

  return v_mission;
end;
$$;

create or replace function public.transition_mission_action(
  p_action_id uuid,
  p_to_status text,
  p_expected_version bigint
)
returns public.mission_actions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action public.mission_actions;
  v_from_status text;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select a.*
    into v_action
    from public.mission_actions a
    join public.missions m on m.id = a.mission_id
   where a.id = p_action_id
     and m.owner_id = auth.uid()
   for update of a;

  if not found then
    raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_expected_version is null or p_expected_version < 1
     or p_expected_version <> v_action.version then
    raise exception 'STALE_VERSION'
      using errcode = 'P0001',
            detail = json_build_object(
              'expected_version', p_expected_version,
              'actual_version', v_action.version
            )::text;
  end if;

  v_from_status := v_action.status;
  select exists (
    select 1
      from (values
        ('PENDING', 'RUNNING'), ('PENDING', 'BLOCKED'),
        ('PENDING', 'CANCELLED'), ('RUNNING', 'COMPLETED'),
        ('RUNNING', 'BLOCKED'), ('RUNNING', 'CANCELLED'),
        ('BLOCKED', 'PENDING'), ('BLOCKED', 'CANCELLED')
      ) as allowed(from_status, to_status)
     where allowed.from_status = v_from_status
       and allowed.to_status = p_to_status
  ) into v_allowed;

  if not v_allowed then
    raise exception 'INVALID_ACTION_TRANSITION'
      using errcode = '22023',
            detail = json_build_object(
              'from_status', v_from_status,
              'to_status', p_to_status
            )::text;
  end if;

  update public.mission_actions
     set status = p_to_status,
         version = version + 1
   where id = v_action.id
  returning * into v_action;

  perform public.record_mission_event(
    v_action.mission_id,
    'ACTION_STATUS_TRANSITION',
    jsonb_build_object(
      'action_id', v_action.id,
      'from_status', v_from_status,
      'to_status', v_action.status,
      'version', v_action.version
    )
  );

  return v_action;
end;
$$;

revoke all on function public.transition_mission(uuid, text, bigint) from public, anon;
revoke all on function public.update_mission_details(uuid, text, bigint) from public, anon;
revoke all on function public.transition_mission_action(uuid, text, bigint) from public, anon;
grant execute on function public.transition_mission(uuid, text, bigint) to authenticated;
grant execute on function public.update_mission_details(uuid, text, bigint) to authenticated;
grant execute on function public.transition_mission_action(uuid, text, bigint) to authenticated;

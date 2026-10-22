alter table public.missions
  add column if not exists version bigint not null default 1;

alter table public.missions
  add constraint missions_version_minimum check (version >= 1);

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

  select exists (
    select 1
      from (values
        ('DRAFT', 'PLANNING'),
        ('DRAFT', 'CANCELLED'),
        ('PLANNING', 'READY'),
        ('PLANNING', 'PAUSED'),
        ('PLANNING', 'BLOCKED'),
        ('PLANNING', 'CANCELLED'),
        ('READY', 'RUNNING'),
        ('READY', 'PAUSED'),
        ('READY', 'BLOCKED'),
        ('READY', 'CANCELLED'),
        ('RUNNING', 'WAITING'),
        ('RUNNING', 'NEEDS_USER'),
        ('RUNNING', 'VERIFYING'),
        ('RUNNING', 'PAUSED'),
        ('RUNNING', 'BLOCKED'),
        ('RUNNING', 'FAILED'),
        ('RUNNING', 'CANCELLED'),
        ('WAITING', 'RUNNING'),
        ('WAITING', 'NEEDS_USER'),
        ('WAITING', 'PAUSED'),
        ('WAITING', 'BLOCKED'),
        ('WAITING', 'CANCELLED'),
        ('NEEDS_USER', 'RUNNING'),
        ('NEEDS_USER', 'PAUSED'),
        ('NEEDS_USER', 'BLOCKED'),
        ('NEEDS_USER', 'CANCELLED'),
        ('VERIFYING', 'COMPLETED'),
        ('VERIFYING', 'FAILED'),
        ('VERIFYING', 'PAUSED'),
        ('VERIFYING', 'BLOCKED'),
        ('VERIFYING', 'CANCELLED'),
        ('PAUSED', 'RUNNING'),
        ('PAUSED', 'CANCELLED'),
        ('BLOCKED', 'PLANNING'),
        ('BLOCKED', 'READY'),
        ('BLOCKED', 'RUNNING'),
        ('BLOCKED', 'CANCELLED')
      ) as allowed(from_status, to_status)
     where allowed.from_status = v_mission.status
       and allowed.to_status = p_to_status
  ) into v_allowed;

  if not v_allowed then
    raise exception 'INVALID_MISSION_TRANSITION'
      using errcode = '22023',
            detail = json_build_object(
              'from_status', v_mission.status,
              'to_status', p_to_status
            )::text;
  end if;

  update public.missions
     set status = p_to_status,
         version = version + 1
   where id = v_mission.id
  returning * into v_mission;

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

  update public.missions
     set objective = btrim(p_objective),
         version = version + 1
   where id = v_mission.id
  returning * into v_mission;

  return v_mission;
end;
$$;

revoke all on function public.transition_mission(uuid, text, bigint) from public, anon;
revoke all on function public.update_mission_details(uuid, text, bigint) from public, anon;
grant execute on function public.transition_mission(uuid, text, bigint) to authenticated;
grant execute on function public.update_mission_details(uuid, text, bigint) to authenticated;

revoke update on table public.missions from authenticated;

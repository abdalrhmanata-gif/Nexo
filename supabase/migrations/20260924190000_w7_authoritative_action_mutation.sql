alter table public.mission_actions
  add column if not exists version bigint not null default 1;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'mission_actions_version_minimum'
       and conrelid = 'public.mission_actions'::regclass
  ) then
    alter table public.mission_actions
      add constraint mission_actions_version_minimum check (version >= 1);
  end if;
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

  select exists (
    select 1
      from (values
        ('PENDING', 'RUNNING'),
        ('PENDING', 'BLOCKED'),
        ('PENDING', 'CANCELLED'),
        ('RUNNING', 'COMPLETED'),
        ('RUNNING', 'BLOCKED'),
        ('RUNNING', 'CANCELLED'),
        ('BLOCKED', 'PENDING'),
        ('BLOCKED', 'CANCELLED')
      ) as allowed(from_status, to_status)
     where allowed.from_status = v_action.status
       and allowed.to_status = p_to_status
  ) into v_allowed;

  if not v_allowed then
    raise exception 'INVALID_ACTION_TRANSITION'
      using errcode = '22023',
            detail = json_build_object(
              'from_status', v_action.status,
              'to_status', p_to_status
            )::text;
  end if;

  update public.mission_actions
     set status = p_to_status,
         version = version + 1
   where id = v_action.id
  returning * into v_action;

  return v_action;
end;
$$;

revoke all on function public.transition_mission_action(uuid, text, bigint) from public, anon;
grant execute on function public.transition_mission_action(uuid, text, bigint) to authenticated;
revoke update on table public.mission_actions from authenticated;

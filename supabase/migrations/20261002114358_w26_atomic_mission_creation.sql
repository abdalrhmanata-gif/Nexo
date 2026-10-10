-- W26 atomic mission creation: mission + initial actions in one transaction.
create or replace function public.create_mission_with_actions(
  p_workspace_id uuid,
  p_objective text,
  p_actions jsonb default '[]'::jsonb
)
returns public.missions
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_mission public.missions;
  v_title text;
  v_position integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_objective is null
     or char_length(btrim(p_objective)) < 1
     or char_length(btrim(p_objective)) > 10000 then
    raise exception 'INVALID_MISSION_OBJECTIVE' using errcode = '22023';
  end if;

  if p_actions is null or jsonb_typeof(p_actions) <> 'array' then
    raise exception 'INVALID_MISSION_ACTIONS' using errcode = '22023';
  end if;

  if jsonb_array_length(p_actions) > 100 then
    raise exception 'TOO_MANY_MISSION_ACTIONS' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_id = v_user_id
  ) then
    raise exception 'WORKSPACE_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.missions (workspace_id, owner_id, objective, status)
  values (p_workspace_id, v_user_id, btrim(p_objective), 'DRAFT')
  returning * into v_mission;

  for v_title in
    select value
    from jsonb_array_elements_text(p_actions)
  loop
    v_title := btrim(v_title);
    if char_length(v_title) < 1 or char_length(v_title) > 2000 then
      raise exception 'INVALID_MISSION_ACTION_TITLE' using errcode = '22023';
    end if;

    insert into public.mission_actions (mission_id, title, position, status)
    values (v_mission.id, v_title, v_position, 'PENDING');

    v_position := v_position + 1;
  end loop;

  return v_mission;
end;
$function$;

revoke all on function public.create_mission_with_actions(uuid, text, jsonb) from public, anon;
grant execute on function public.create_mission_with_actions(uuid, text, jsonb) to authenticated;

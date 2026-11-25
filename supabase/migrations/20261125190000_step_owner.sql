-- An owner for each step (25 Nov 2026).
--
-- Small teams buy checklists so that every step has a name next to it and
-- nobody has to ask "who is doing this?". A step can now name one person in
-- the workspace who is responsible for it.
--
-- - mission_actions.assignee_id: nullable, the person responsible. It is set
--   only through set_mission_action_assignee, never written directly
--   (authenticated has no UPDATE or INSERT privilege on the column).
-- - Who can set it: anyone who can edit the workspace (owner, admin, member),
--   the same rule as the daily work (20261125180000).
-- - Who can be named: someone who can edit the workspace, because a viewer
--   could not tick the step off.
-- - Only open steps (not done, not cancelled) take a new owner; a finished
--   step keeps the name of the person who had it.
-- - When someone leaves the workspace or becomes a viewer, their open steps
--   in it lose their owner, so no step points at a person who cannot act.
-- - Every change is in the Mission's history as ACTION_ASSIGNED, with the
--   person who made it as actor.
-- - New steps start without an owner, however they are inserted.
-- - mission_step_owners(mission) gives the page everything it needs to show
--   and change owners in one call.
--
-- Additive only: one nullable column, one index, new functions and triggers.

alter table public.mission_actions
  add column if not exists assignee_id uuid references auth.users(id) on delete set null;

create index if not exists mission_actions_assignee_open_idx
  on public.mission_actions (assignee_id)
  where assignee_id is not null and status not in ('COMPLETED', 'CANCELLED');

grant select (assignee_id) on public.mission_actions to authenticated;

create or replace function private.set_mission_action_assignee(
  p_action_id uuid,
  p_expected_version bigint,
  p_assignee_id uuid
)
returns public.mission_actions
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action public.mission_actions;
  v_workspace_id uuid;
  v_previous uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select a.* into v_action
    from public.mission_actions a
    join public.missions m on m.id = a.mission_id
   where a.id = p_action_id
     and private.can_edit_workspace(m.workspace_id, auth.uid())
   for update of a;
  if not found then
    raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  select m.workspace_id into v_workspace_id
    from public.missions m where m.id = v_action.mission_id;

  if p_expected_version is null or p_expected_version < 1 or p_expected_version <> v_action.version then
    raise exception 'STALE_VERSION'
      using errcode = 'P0001',
            detail = json_build_object('expected_version', p_expected_version, 'actual_version', v_action.version)::text;
  end if;

  if v_action.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'ASSIGNEE_REQUIRES_OPEN_STEP' using errcode = '22023';
  end if;

  if p_assignee_id is not null and not private.can_edit_workspace(v_workspace_id, p_assignee_id) then
    raise exception 'ASSIGNEE_MUST_BE_EDITOR' using errcode = '22023';
  end if;

  v_previous := v_action.assignee_id;
  if v_previous is not distinct from p_assignee_id then
    return v_action;
  end if;

  update public.mission_actions
     set assignee_id = p_assignee_id,
         version = version + 1
   where id = v_action.id
  returning * into v_action;

  perform public.record_mission_event(
    v_action.mission_id,
    'ACTION_ASSIGNED',
    jsonb_build_object(
      'action_id', v_action.id,
      'assignee_id', p_assignee_id,
      'previous_assignee_id', v_previous,
      'version', v_action.version
    )
  );
  return v_action;
end;
$$;

create or replace function public.set_mission_action_assignee(
  p_action_id uuid,
  p_expected_version bigint,
  p_assignee_id uuid
)
returns public.mission_actions
language sql
set search_path = pg_catalog, public
as $$ select private.set_mission_action_assignee(p_action_id, p_expected_version, p_assignee_id); $$;

-- Someone who leaves the workspace, or can no longer edit it, stops owning
-- its open steps.
create or replace function private.release_step_owners()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role not in ('owner', 'admin', 'member')) then
    update public.mission_actions a
       set assignee_id = null,
           version = a.version + 1
      from public.missions m
     where m.id = a.mission_id
       and m.workspace_id = old.workspace_id
       and a.assignee_id = old.user_id
       and a.status not in ('COMPLETED', 'CANCELLED');
  end if;
  return null;
end;
$$;

drop trigger if exists workspace_members_release_step_owners on public.workspace_members;
create trigger workspace_members_release_step_owners
  after delete or update of role on public.workspace_members
  for each row execute function private.release_step_owners();

-- authenticated may INSERT steps (the guard checks the Mission), so a new
-- step could otherwise arrive already naming anyone. Steps start without an
-- owner; naming one goes through set_mission_action_assignee and its checks.
create or replace function private.steps_start_unassigned()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.assignee_id := null;
  return new;
end;
$$;

drop trigger if exists mission_actions_start_unassigned on public.mission_actions;
create trigger mission_actions_start_unassigned
  before insert on public.mission_actions
  for each row execute function private.steps_start_unassigned();

-- What the Mission page needs to show and change step owners, in one round
-- trip: who may be named (the workspace's editors, with their email, which
-- every member can already read on list_workspace_members), who owns each
-- step, and whether the reader may change it. Null when the reader cannot
-- see the Mission.
create or replace function private.mission_step_owners(p_mission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  select m.workspace_id into v_workspace_id from public.missions m where m.id = p_mission_id;
  if v_workspace_id is null or not private.is_workspace_member(v_workspace_id, auth.uid()) then
    return null;
  end if;
  return jsonb_build_object(
    'can_assign', private.can_edit_workspace(v_workspace_id, auth.uid()),
    'editors', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', wm.user_id, 'email', au.email) order by wm.created_at)
        from public.workspace_members wm
        join auth.users au on au.id = wm.user_id
       where wm.workspace_id = v_workspace_id
         and wm.role in ('owner', 'admin', 'member')
    ), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_object_agg(a.id, a.assignee_id)
        from public.mission_actions a
       where a.mission_id = p_mission_id
         and a.assignee_id is not null
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function public.mission_step_owners(p_mission_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$ select private.mission_step_owners(p_mission_id); $$;

revoke all on function private.steps_start_unassigned() from public, anon, authenticated;
revoke all on function private.mission_step_owners(uuid) from public, anon;
revoke all on function public.mission_step_owners(uuid) from public, anon;
grant execute on function private.mission_step_owners(uuid) to authenticated;
grant execute on function public.mission_step_owners(uuid) to authenticated;

revoke all on function private.set_mission_action_assignee(uuid, bigint, uuid) from public, anon;
revoke all on function public.set_mission_action_assignee(uuid, bigint, uuid) from public, anon;
revoke all on function private.release_step_owners() from public, anon, authenticated;
grant execute on function private.set_mission_action_assignee(uuid, bigint, uuid) to authenticated;
grant execute on function public.set_mission_action_assignee(uuid, bigint, uuid) to authenticated;

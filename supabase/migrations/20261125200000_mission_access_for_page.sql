-- What the reader may do on a Mission, in the read the page already makes
-- (25 Nov 2026).
--
-- mission_step_owners (20261125190000) gave the page the editors, the step
-- owners and whether the reader can edit. With teams the page also needs to
-- know whether the reader created the Mission (only the creator edits its
-- details, sets its dates, records verification and closes it), their role
-- (only owners and admins delete), and the creator's email (the page said
-- "Owner: You" on Missions somebody else created), and the Mission's text for
-- the email that tells someone a step is now theirs. The reader can already
-- read all of it through row level security.
--
-- Same function, same signature, the same single round trip; the answer has
-- four more keys. Nothing decides access here: every change is still checked
-- by the function or policy that makes it.

create or replace function private.mission_step_owners(p_mission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_mission public.missions;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v_mission from public.missions m where m.id = p_mission_id;
  if not found or not private.is_workspace_member(v_mission.workspace_id, auth.uid()) then
    return null;
  end if;
  return jsonb_build_object(
    'can_assign', private.can_edit_workspace(v_mission.workspace_id, auth.uid()),
    'is_creator', v_mission.owner_id = auth.uid(),
    'role', private.workspace_role(v_mission.workspace_id, auth.uid()),
    'creator_email', (select au.email from auth.users au where au.id = v_mission.owner_id),
    'mission_objective', v_mission.objective,
    'editors', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', wm.user_id, 'email', au.email) order by wm.created_at)
        from public.workspace_members wm
        join auth.users au on au.id = wm.user_id
       where wm.workspace_id = v_mission.workspace_id
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

revoke all on function private.mission_step_owners(uuid) from public, anon;
grant execute on function private.mission_step_owners(uuid) to authenticated;

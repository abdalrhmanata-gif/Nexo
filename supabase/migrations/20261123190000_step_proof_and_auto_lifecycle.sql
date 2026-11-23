-- Step proof and an automatic Mission lifecycle (23 Nov 2026).
--
-- 1. Proof on each step. A step marked done can carry a short note and/or a
--    link that shows it was done ("confirmation 4471", a receipt URL). Until
--    now evidence existed only once per Mission, at verification time, so the
--    record of *how* each step was finished was lost.
-- 2. One tap to finish a step. complete_mission_action moves a step from
--    Not started, In progress or Waiting straight to Complete and stores the
--    proof in the same statement. The two-save route through In progress
--    stays available through transition_mission_action, unchanged.
-- 3. The Mission follows its steps. advance_mission_lifecycle walks a Mission
--    from Draft through Planning and Ready to Running once any step has
--    started or finished, and, when the user records verification with every
--    step finished or cancelled, on to Checking (VERIFYING). It never moves a
--    Mission to Checking on its own, so a step can still be added while the
--    Mission runs. Each move goes through private.transition_mission,
--    so the transition table, the version check, the owner check and the
--    history event are exactly the ones a manual move gets. Completing a
--    Mission still requires a verified outcome; nothing here touches that.
--
-- Additive only: new nullable columns, new functions. No existing function
-- body changes.

alter table public.mission_actions
  add column if not exists evidence_note text,
  add column if not exists evidence_url text,
  add column if not exists completed_at timestamptz;

alter table public.mission_actions
  drop constraint if exists mission_actions_evidence_note_shape,
  add constraint mission_actions_evidence_note_shape
    check (evidence_note is null or (char_length(evidence_note) between 1 and 1000 and evidence_note = btrim(evidence_note)));

alter table public.mission_actions
  drop constraint if exists mission_actions_evidence_url_shape,
  add constraint mission_actions_evidence_url_shape
    check (evidence_url is null or (
      char_length(evidence_url) <= 2048
      and evidence_url ~ '^https?://[^[:space:]/?#]+'
      and evidence_url !~ '[[:space:]]'
    ));

-- Normalises user text: trimmed, empty becomes null.
create or replace function private.clean_step_proof(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(btrim(coalesce(p_value, '')), '');
$$;

-- p_target 'RUNNING': once any step has started or finished, walk Draft,
-- Planning or Ready forward to Running. A Mission the user paused or that is
-- waiting stays where it is.
-- p_target 'VERIFYING': the user asked to record verification and every step
-- is finished or cancelled, so walk forward (resuming from Paused, Blocked,
-- Waiting or Needs you) to Checking. Terminal Missions are returned unchanged.
create or replace function private.advance_mission_lifecycle(p_mission_id uuid, p_target text)
returns public.missions
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_mission public.missions;
  v_unresolved integer;
  v_started integer;
  v_next text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_target is null or p_target not in ('RUNNING', 'VERIFYING') then
    raise exception 'INVALID_LIFECYCLE_TARGET' using errcode = '22023';
  end if;

  -- Same lock order as private.transition_mission: advisory lock, then row.
  perform pg_advisory_xact_lock(hashtextextended('zavqera:mission:' || p_mission_id::text, 0));
  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or v_mission.owner_id <> auth.uid() then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select count(*) filter (where status not in ('COMPLETED', 'CANCELLED')),
         count(*) filter (where status in ('RUNNING', 'COMPLETED'))
    into v_unresolved, v_started
    from public.mission_actions
   where mission_id = p_mission_id;

  if p_target = 'RUNNING' then
    if v_started = 0 then
      return v_mission;
    end if;
    while v_mission.status in ('DRAFT', 'PLANNING', 'READY') loop
      v_next := case v_mission.status when 'DRAFT' then 'PLANNING' when 'PLANNING' then 'READY' else 'RUNNING' end;
      v_mission := private.transition_mission(v_mission.id, v_next, v_mission.version);
    end loop;
    return v_mission;
  end if;

  -- p_target = 'VERIFYING'
  if v_mission.status = 'VERIFYING' or v_mission.status in ('COMPLETED', 'FAILED', 'CANCELLED') then
    return v_mission;
  end if;
  if v_unresolved > 0 then
    raise exception 'ALL_ACTIONS_MUST_BE_RESOLVED' using errcode = '22023';
  end if;
  while v_mission.status <> 'RUNNING' loop
    v_next := case v_mission.status
      when 'DRAFT' then 'PLANNING'
      when 'PLANNING' then 'READY'
      else 'RUNNING'
    end;
    v_mission := private.transition_mission(v_mission.id, v_next, v_mission.version);
  end loop;
  return private.transition_mission(v_mission.id, 'VERIFYING', v_mission.version);
end;
$$;

create or replace function private.complete_mission_action(
  p_action_id uuid,
  p_expected_version bigint,
  p_evidence_note text default null,
  p_evidence_url text default null
)
returns public.mission_actions
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action public.mission_actions;
  v_from_status text;
  v_note text := private.clean_step_proof(p_evidence_note);
  v_url text := private.clean_step_proof(p_evidence_url);
  v_mission_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  -- Lock the Mission first (same order as private.transition_mission), so the
  -- lifecycle step at the end cannot deadlock against a manual transition.
  select mission_id into v_mission_id from public.mission_actions where id = p_action_id;
  if v_mission_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('zavqera:mission:' || v_mission_id::text, 0));
  end if;

  select a.* into v_action
    from public.mission_actions a
    join public.missions m on m.id = a.mission_id
   where a.id = p_action_id
     and m.owner_id = auth.uid()
   for update of a;
  if not found then
    raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_expected_version is null or p_expected_version < 1 or p_expected_version <> v_action.version then
    raise exception 'STALE_VERSION'
      using errcode = 'P0001',
            detail = json_build_object('expected_version', p_expected_version, 'actual_version', v_action.version)::text;
  end if;

  v_from_status := v_action.status;
  if v_from_status not in ('PENDING', 'RUNNING', 'BLOCKED') then
    raise exception 'INVALID_ACTION_TRANSITION'
      using errcode = '22023',
            detail = json_build_object('from_status', v_from_status, 'to_status', 'COMPLETED')::text;
  end if;

  update public.mission_actions
     set status = 'COMPLETED',
         follow_up_at = null,
         evidence_note = v_note,
         evidence_url = v_url,
         completed_at = timezone('utc', now()),
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
      'version', v_action.version,
      'has_proof', (v_note is not null or v_url is not null)
    )
  );

  perform private.advance_mission_lifecycle(v_action.mission_id, 'RUNNING');
  return v_action;
end;
$$;

create or replace function private.set_mission_action_proof(
  p_action_id uuid,
  p_expected_version bigint,
  p_evidence_note text,
  p_evidence_url text
)
returns public.mission_actions
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action public.mission_actions;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select a.* into v_action
    from public.mission_actions a
    join public.missions m on m.id = a.mission_id
   where a.id = p_action_id
     and m.owner_id = auth.uid()
   for update of a;
  if not found then
    raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_expected_version is null or p_expected_version < 1 or p_expected_version <> v_action.version then
    raise exception 'STALE_VERSION'
      using errcode = 'P0001',
            detail = json_build_object('expected_version', p_expected_version, 'actual_version', v_action.version)::text;
  end if;

  if v_action.status <> 'COMPLETED' then
    raise exception 'PROOF_REQUIRES_COMPLETED_STEP' using errcode = '22023';
  end if;

  update public.mission_actions
     set evidence_note = private.clean_step_proof(p_evidence_note),
         evidence_url = private.clean_step_proof(p_evidence_url),
         version = version + 1
   where id = v_action.id
  returning * into v_action;

  perform public.record_mission_event(
    v_action.mission_id,
    'ACTION_PROOF_RECORDED',
    jsonb_build_object(
      'action_id', v_action.id,
      'version', v_action.version,
      'has_proof', (v_action.evidence_note is not null or v_action.evidence_url is not null)
    )
  );
  return v_action;
end;
$$;

-- Public wrappers, the same shape as the existing ones.
create or replace function public.advance_mission_lifecycle(p_mission_id uuid, p_target text)
returns public.missions
language sql
set search_path = pg_catalog, public
as $$ select private.advance_mission_lifecycle(p_mission_id, p_target); $$;

create or replace function public.complete_mission_action(p_action_id uuid, p_expected_version bigint, p_evidence_note text default null, p_evidence_url text default null)
returns public.mission_actions
language sql
set search_path = pg_catalog, public
as $$ select private.complete_mission_action(p_action_id, p_expected_version, p_evidence_note, p_evidence_url); $$;

create or replace function public.set_mission_action_proof(p_action_id uuid, p_expected_version bigint, p_evidence_note text, p_evidence_url text)
returns public.mission_actions
language sql
set search_path = pg_catalog, public
as $$ select private.set_mission_action_proof(p_action_id, p_expected_version, p_evidence_note, p_evidence_url); $$;

revoke all on function private.clean_step_proof(text) from public, anon;
revoke all on function private.advance_mission_lifecycle(uuid, text) from public, anon;
revoke all on function private.complete_mission_action(uuid, bigint, text, text) from public, anon;
revoke all on function private.set_mission_action_proof(uuid, bigint, text, text) from public, anon;
revoke all on function public.advance_mission_lifecycle(uuid, text) from public, anon;
revoke all on function public.complete_mission_action(uuid, bigint, text, text) from public, anon;
revoke all on function public.set_mission_action_proof(uuid, bigint, text, text) from public, anon;

grant execute on function private.clean_step_proof(text) to authenticated;
grant execute on function private.advance_mission_lifecycle(uuid, text) to authenticated;
grant execute on function private.complete_mission_action(uuid, bigint, text, text) to authenticated;
grant execute on function private.set_mission_action_proof(uuid, bigint, text, text) to authenticated;
grant execute on function public.advance_mission_lifecycle(uuid, text) to authenticated;
grant execute on function public.complete_mission_action(uuid, bigint, text, text) to authenticated;
grant execute on function public.set_mission_action_proof(uuid, bigint, text, text) to authenticated;

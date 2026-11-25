-- Team members who can edit a workspace can work on its Missions (25 Nov 2026).
--
-- Workspace invitations (15 Nov) let an owner invite people who "Can edit"
-- (role member) or "Can view" (role viewer). The row level security policies
-- already let editors insert and update steps, but the database functions
-- that every change goes through still checked `missions.owner_id =
-- auth.uid()`, a rule from when each account had one user. Seen on 25 Nov: an
-- editor got "forbidden" on every step of a Mission somebody else created,
-- while the page showed them the buttons.
--
-- Changed: the creator-only check in the six functions of the daily work
-- (add a step, change a step's status, mark it done, record its proof, and the
-- Mission's own status, which follows its steps) becomes
-- private.can_edit_workspace(workspace_id): the owner, admins and members.
-- Each function body is otherwise exactly the one in production on 25 Nov.
--
-- Unchanged on purpose:
-- - viewers stay read-only (can_edit_workspace is false for them);
-- - recording verification, committing the outcome and editing the Mission's
--   name and intent stay with its creator: closing a Mission is the creator's
--   decision, and those rows carry the creator as owner_id;
-- - deleting a Mission stays with the owner and admins (row level security);
-- - the history still records who made each change (actor_id).
--
-- No table or data changes.

create or replace function private.transition_mission(p_mission_id uuid, p_to_status text, p_expected_version bigint)
 returns missions
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_mission public.missions;
  v_from_status text;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  -- Serialize transitions for one Mission before acquiring the Mission row lock.
  -- The advisory lock is transaction-scoped and releases automatically on commit/rollback.
  perform pg_advisory_xact_lock(
    hashtextextended('zavqera:mission:' || p_mission_id::text, 0)
  );

  select *
    into v_mission
    from public.missions
   where id = p_mission_id
   for update;

  if not found or not private.can_edit_workspace(v_mission.workspace_id, auth.uid()) then
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
$function$;

create or replace function private.advance_mission_lifecycle(p_mission_id uuid, p_target text)
 returns missions
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'private'
as $function$
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

  perform pg_advisory_xact_lock(hashtextextended('zavqera:mission:' || p_mission_id::text, 0));
  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or not private.can_edit_workspace(v_mission.workspace_id, auth.uid()) then
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
$function$;

create or replace function private.complete_mission_action(p_action_id uuid, p_expected_version bigint, p_evidence_note text default null::text, p_evidence_url text default null::text)
 returns mission_actions
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'private'
as $function$
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

  select mission_id into v_mission_id from public.mission_actions where id = p_action_id;
  if v_mission_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('zavqera:mission:' || v_mission_id::text, 0));
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
$function$;

create or replace function private.transition_mission_action(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone default null::timestamp with time zone, p_set_follow_up boolean default false)
 returns mission_actions
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_action public.mission_actions;
  v_from_status text;
  v_previous_follow_up timestamptz;
  v_next_follow_up timestamptz;
  v_set_follow_up boolean := coalesce(p_set_follow_up, false);
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
     and private.can_edit_workspace(m.workspace_id, auth.uid())
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
  v_previous_follow_up := v_action.follow_up_at;

  if v_set_follow_up and p_to_status <> 'BLOCKED' then
    raise exception 'FOLLOW_UP_REQUIRES_WAITING'
      using errcode = '22023',
            detail = json_build_object('to_status', p_to_status)::text;
  end if;

  if v_set_follow_up and p_follow_up_at is not null then
    if p_follow_up_at < timezone('utc', now()) - interval '1 day' then
      raise exception 'FOLLOW_UP_IN_PAST' using errcode = '22023';
    end if;
    if p_follow_up_at > timezone('utc', now()) + interval '10 years' then
      raise exception 'FOLLOW_UP_TOO_DISTANT' using errcode = '22023';
    end if;
  end if;

  select exists (
    select 1
      from (values
        ('PENDING', 'RUNNING'), ('PENDING', 'BLOCKED'),
        ('PENDING', 'CANCELLED'), ('RUNNING', 'COMPLETED'),
        ('RUNNING', 'BLOCKED'), ('RUNNING', 'CANCELLED'),
        ('BLOCKED', 'PENDING'), ('BLOCKED', 'CANCELLED'),
        ('BLOCKED', 'RUNNING')
      ) as allowed(from_status, to_status)
     where allowed.from_status = v_from_status
       and allowed.to_status = p_to_status
  ) into v_allowed;

  if not v_allowed
     and v_from_status = 'BLOCKED'
     and p_to_status = 'BLOCKED'
     and v_set_follow_up then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'INVALID_ACTION_TRANSITION'
      using errcode = '22023',
            detail = json_build_object(
              'from_status', v_from_status,
              'to_status', p_to_status
            )::text;
  end if;

  if p_to_status <> 'BLOCKED' then
    v_next_follow_up := null;
  elsif v_set_follow_up then
    v_next_follow_up := p_follow_up_at;
  else
    v_next_follow_up := v_previous_follow_up;
  end if;

  update public.mission_actions
     set status = p_to_status,
         follow_up_at = v_next_follow_up,
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
      'follow_up_at', v_action.follow_up_at,
      'previous_follow_up_at', v_previous_follow_up
    )
  );

  return v_action;
end;
$function$;

create or replace function private.set_mission_action_proof(p_action_id uuid, p_expected_version bigint, p_evidence_note text, p_evidence_url text)
 returns mission_actions
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'private'
as $function$
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
     and private.can_edit_workspace(m.workspace_id, auth.uid())
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
$function$;

create or replace function public.guard_mission_action_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select status into v_status
    from public.missions
   where id = new.mission_id and private.can_edit_workspace(workspace_id, auth.uid())
   for update;
  if not found then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'MISSION_ALREADY_COMPLETED' using errcode = '22023';
  end if;
  return new;
end;
$function$;

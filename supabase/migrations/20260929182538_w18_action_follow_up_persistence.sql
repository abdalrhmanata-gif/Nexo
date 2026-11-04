-- W18 — authoritative follow-up persistence for mission actions.
--
-- `mission_actions.follow_up_at` and its partial index were created in W4 but
-- nothing has ever written to the column, because
-- `transition_mission_action(uuid, text, bigint)` had no way to carry a
-- follow-up date. Direct UPDATE on the table is revoked from `authenticated`
-- (W7), so the RPC is the only write path and is the correct place to fix this.
--
-- No table, column, index or data change is introduced by the migration itself.
-- It adds an integrity constraint and replaces the existing authoritative RPC.
--
-- Follow-up semantics (enforced in the database, not in the client):
--   * A follow-up date only exists while an action is BLOCKED ("Waiting").
--   * Any transition out of BLOCKED clears it, and the clearing is recorded in
--     mission_events so it is provenance, not silent data loss.
--   * Transitioning while staying BLOCKED preserves the existing date unless
--     the caller explicitly sets one, which is how a date is changed or removed.
--
-- Rollback: see docs/ZAVQERA_W18_FOLLOW_UP_PERSISTENCE.md.

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'mission_actions_follow_up_requires_blocked'
       and conrelid = 'public.mission_actions'::regclass
  ) then
    alter table public.mission_actions
      add constraint mission_actions_follow_up_requires_blocked
      check (follow_up_at is null or status = 'BLOCKED') not valid;
  end if;
end;
$$;

drop function if exists public.transition_mission_action(uuid, text, bigint);

create or replace function public.transition_mission_action(
  p_action_id uuid,
  p_to_status text,
  p_expected_version bigint,
  p_follow_up_at timestamptz default null,
  p_set_follow_up boolean default false
)
returns public.mission_actions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
$$;

revoke all on function public.transition_mission_action(uuid, text, bigint, timestamptz, boolean) from public, anon;
grant execute on function public.transition_mission_action(uuid, text, bigint, timestamptz, boolean) to authenticated;
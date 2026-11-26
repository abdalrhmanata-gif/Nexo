-- Repeating checklists: a checklist that starts again by itself every day,
-- week or month, with the same steps and the same step owners.
--
-- Why: the work small teams pay to keep track of is the work they repeat
-- (opening and closing a restaurant, the cleaning schedule, the month-end
-- close). Without this, every day's list had to be started by hand.
--
-- How it works:
-- - public.mission_repeats holds the rule (how often, in which time zone) and
--   a copy of the steps and their owners, taken from the checklist it was set
--   up on.
-- - public.mission_repeat_runs links each period (the day, the week's day or
--   the month's day the run belongs to) to the checklist made for it. One run
--   per period: the unique key stops two people opening the app at once from
--   making two.
-- - The checklist it was set up on is the first run, for the current period.
-- - public.run_due_mission_repeats(), called when someone who can edit
--   opens the workspace, makes the run for the current period of every repeat in the
--   caller's workspaces that does not have one yet. Missed periods are not
--   filled in: a team that was away comes back to today's list, not a pile.
-- - Each run is a normal checklist: step owners kept (if they can still edit
--   the workspace), every step due at the end of its period, and the
--   checklist's target date set to the same day, so what is late shows.
--
-- Plans: Free 1 active repeat, Plus 3, Pro and Scale 100, counted for the
-- person who set them up. After a downgrade the oldest repeats within the
-- new allowance keep running and the rest wait, unchanged, until the plan
-- allows them again.
--
-- Additive only: two new tables, new functions. Nothing existing changes.

create table if not exists public.mission_repeats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_mission_id uuid references public.missions(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  objective text not null check (char_length(btrim(objective)) between 1 and 9000),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 50),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  -- daily: the ISO weekdays it runs on (1 Monday … 7 Sunday).
  weekdays smallint[] not null default '{1,2,3,4,5,6,7}',
  -- weekly: the ISO weekday each run starts on.
  weekday smallint check (weekday between 1 and 7),
  -- monthly: the day of the month; 31 means the last day in shorter months.
  month_day smallint check (month_day between 1 and 31),
  time_zone text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  stopped_at timestamptz,
  constraint mission_repeats_rule check (
    (frequency = 'daily' and cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[])
    or (frequency = 'weekly' and weekday is not null)
    or (frequency = 'monthly' and month_day is not null)
  )
);

-- One running repeat per checklist it was set up on.
create unique index if not exists mission_repeats_one_active_per_source
  on public.mission_repeats (source_mission_id) where active and source_mission_id is not null;
create index if not exists mission_repeats_workspace_active
  on public.mission_repeats (workspace_id) where active;

create table if not exists public.mission_repeat_runs (
  repeat_id uuid not null references public.mission_repeats(id) on delete cascade,
  period date not null check (period between '2000-01-01' and '2100-12-31'),
  mission_id uuid references public.missions(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (repeat_id, period)
);
create index if not exists mission_repeat_runs_mission on public.mission_repeat_runs (mission_id);

alter table public.mission_repeats enable row level security;
alter table public.mission_repeat_runs enable row level security;
revoke all on public.mission_repeats, public.mission_repeat_runs from anon, authenticated;
grant select on public.mission_repeats, public.mission_repeat_runs to authenticated;

drop policy if exists mission_repeats_select_member on public.mission_repeats;
create policy mission_repeats_select_member on public.mission_repeats
  for select to authenticated using (private.is_workspace_member(workspace_id));

drop policy if exists mission_repeat_runs_select_member on public.mission_repeat_runs;
create policy mission_repeat_runs_select_member on public.mission_repeat_runs
  for select to authenticated using (
    exists (select 1 from public.mission_repeats r where r.id = repeat_id and private.is_workspace_member(r.workspace_id))
  );

-- How many repeats a person may have running, by their plan.
create or replace function private.repeat_allowance(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select case coalesce((select e.plan from public.ai_entitlements e where e.user_id = p_user_id), 'free')
    when 'pro' then 100 when 'scale' then 100 when 'plus' then 3 else 1 end;
$function$;
revoke all on function private.repeat_allowance(uuid) from public, anon, authenticated;

-- The period a repeat is in on a given local day: the most recent day on
-- which a run starts. Its end is the day before the next one.
create or replace function private.repeat_period(
  p_frequency text, p_weekdays smallint[], p_weekday smallint, p_month_day smallint, p_today date
) returns date
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_day date;
  v_candidate date;
begin
  if p_frequency = 'daily' then
    for v_offset in 0..6 loop
      v_day := p_today - v_offset;
      if extract(isodow from v_day)::smallint = any (p_weekdays) then return v_day; end if;
    end loop;
    return null;
  elsif p_frequency = 'weekly' then
    return p_today - ((extract(isodow from p_today)::integer - p_weekday + 7) % 7);
  elsif p_frequency = 'monthly' then
    v_candidate := date_trunc('month', p_today)::date
      + (least(p_month_day, extract(day from (date_trunc('month', p_today) + interval '1 month - 1 day'))::smallint) - 1);
    if v_candidate <= p_today then return v_candidate; end if;
    v_day := (date_trunc('month', p_today) - interval '1 month')::date;
    return v_day + (least(p_month_day, extract(day from (v_day + interval '1 month - 1 day'))::smallint) - 1);
  end if;
  return null;
end;
$function$;
revoke all on function private.repeat_period(text, smallint[], smallint, smallint, date) from public, anon, authenticated;

create or replace function private.repeat_period_end(
  p_frequency text, p_weekdays smallint[], p_weekday smallint, p_month_day smallint, p_period date
) returns date
language plpgsql
immutable
set search_path = pg_catalog, private
as $function$
declare
  v_next date;
begin
  if p_frequency = 'daily' then return p_period; end if;
  if p_frequency = 'weekly' then return p_period + 6; end if;
  -- monthly: the day before next month's run.
  v_next := (date_trunc('month', p_period) + interval '1 month')::date;
  v_next := v_next + (least(p_month_day, extract(day from (v_next + interval '1 month - 1 day'))::smallint) - 1);
  return v_next - 1;
end;
$function$;
revoke all on function private.repeat_period_end(text, smallint[], smallint, smallint, date) from public, anon, authenticated;

-- Make the run of one repeat for one period, unless it exists. Returns the
-- new checklist's id, or null when there was nothing to do.
create or replace function private.materialize_repeat_run(p_repeat_id uuid, p_period date)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_repeat public.mission_repeats%rowtype;
  v_mission_id uuid;
  v_name text;
  v_rest text;
  v_end date;
  v_step jsonb;
  v_position integer := 0;
  v_action_id uuid;
  v_assignee uuid;
begin
  select * into v_repeat from public.mission_repeats where id = p_repeat_id and active;
  if not found then return null; end if;

  insert into public.mission_repeat_runs (repeat_id, period)
  values (p_repeat_id, p_period)
  on conflict (repeat_id, period) do nothing;
  if not found then return null; end if;

  -- The name gets the period's date, so each day's list is told apart.
  -- A repeat set up on a run must not stack dates: the old one is dropped.
  v_name := regexp_replace(split_part(v_repeat.objective, E'\n', 1), ' · [0-9]{4}-[0-9]{2}-[0-9]{2}$', '');
  v_rest := case when position(E'\n' in v_repeat.objective) > 0
    then substr(v_repeat.objective, position(E'\n' in v_repeat.objective)) else '' end;
  insert into public.missions (workspace_id, owner_id, objective, status)
  values (v_repeat.workspace_id, v_repeat.created_by,
          left(v_name, 300) || ' · ' || to_char(p_period, 'YYYY-MM-DD') || v_rest, 'DRAFT')
  returning id into v_mission_id;

  v_end := private.repeat_period_end(v_repeat.frequency, v_repeat.weekdays, v_repeat.weekday, v_repeat.month_day, p_period);
  insert into public.mission_schedules (mission_id, target_date) values (v_mission_id, v_end)
  on conflict do nothing;

  for v_step in select value from jsonb_array_elements(v_repeat.steps) loop
    insert into public.mission_actions (mission_id, title, position, status)
    values (v_mission_id, left(btrim(v_step->>'title'), 2000), v_position, 'PENDING')
    returning id into v_action_id;
    insert into public.action_due_dates (action_id, mission_id, due_on) values (v_action_id, v_mission_id, v_end);
    -- Steps start unassigned (a trigger makes sure); the owner is put back
    -- only if they can still edit this workspace.
    v_assignee := nullif(v_step->>'assignee_id', '')::uuid;
    if v_assignee is not null and private.can_edit_workspace(v_repeat.workspace_id, v_assignee) then
      update public.mission_actions set assignee_id = v_assignee where id = v_action_id;
    end if;
    v_position := v_position + 1;
  end loop;

  update public.mission_repeat_runs set mission_id = v_mission_id
   where repeat_id = p_repeat_id and period = p_period;
  return v_mission_id;
end;
$function$;
revoke all on function private.materialize_repeat_run(uuid, date) from public, anon, authenticated;

-- Set up a repeat on a checklist the caller can edit. The checklist becomes
-- the run for the current period.
create or replace function private.create_mission_repeat(
  p_mission_id uuid,
  p_frequency text,
  p_weekdays smallint[],
  p_weekday smallint,
  p_month_day smallint,
  p_time_zone text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_steps jsonb;
  v_repeat_id uuid;
  v_period date;
  v_running integer;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  select * into v_mission from public.missions where id = p_mission_id;
  if not found or not private.can_edit_workspace(v_mission.workspace_id, v_user) then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if p_frequency is null or p_frequency not in ('daily', 'weekly', 'monthly') then
    raise exception 'INVALID_REPEAT_RULE' using errcode = '22023';
  end if;
  if p_time_zone is null or not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('title', a.title, 'assignee_id', a.assignee_id) order by a.position)
    into v_steps
    from public.mission_actions a
   where a.mission_id = p_mission_id and a.status <> 'CANCELLED';
  if v_steps is null or jsonb_array_length(v_steps) = 0 then
    raise exception 'REPEAT_NEEDS_STEPS' using errcode = '22023';
  end if;
  if jsonb_array_length(v_steps) > 50 then
    raise exception 'REPEAT_TOO_MANY_STEPS' using errcode = '22023';
  end if;

  -- One person sets up repeats one at a time, so the count holds.
  perform pg_advisory_xact_lock(hashtext('mission_repeats:' || v_user::text));
  select count(*) into v_running from public.mission_repeats where created_by = v_user and active;
  if v_running >= private.repeat_allowance(v_user) then
    raise exception 'REPEAT_LIMIT_REACHED' using errcode = '22023';
  end if;
  if exists (select 1 from public.mission_repeats where source_mission_id = p_mission_id and active) then
    raise exception 'REPEAT_ALREADY_SET' using errcode = '22023';
  end if;

  insert into public.mission_repeats (workspace_id, source_mission_id, created_by, objective, steps,
                                      frequency, weekdays, weekday, month_day, time_zone)
  values (v_mission.workspace_id, p_mission_id, v_user, left(v_mission.objective, 9000), v_steps, p_frequency,
          case when p_frequency = 'daily' then coalesce(p_weekdays, '{1,2,3,4,5,6,7}') else '{1,2,3,4,5,6,7}' end,
          case when p_frequency = 'weekly' then p_weekday end,
          case when p_frequency = 'monthly' then p_month_day end,
          p_time_zone)
  returning id into v_repeat_id;

  v_period := private.repeat_period(p_frequency,
    case when p_frequency = 'daily' then coalesce(p_weekdays, '{1,2,3,4,5,6,7}') else '{1,2,3,4,5,6,7}' end,
    p_weekday, p_month_day, (now() at time zone p_time_zone)::date);
  if v_period is not null then
    insert into public.mission_repeat_runs (repeat_id, period, mission_id) values (v_repeat_id, v_period, p_mission_id);
  end if;
  return v_repeat_id;
end;
$function$;
revoke all on function private.create_mission_repeat(uuid, text, smallint[], smallint, smallint, text) from public, anon;
grant execute on function private.create_mission_repeat(uuid, text, smallint[], smallint, smallint, text) to authenticated;

create or replace function public.create_mission_repeat(
  p_mission_id uuid, p_frequency text, p_weekdays smallint[], p_weekday smallint, p_month_day smallint, p_time_zone text
) returns uuid
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private.create_mission_repeat(p_mission_id, p_frequency, p_weekdays, p_weekday, p_month_day, p_time_zone); $$;
revoke all on function public.create_mission_repeat(uuid, text, smallint[], smallint, smallint, text) from public, anon;
grant execute on function public.create_mission_repeat(uuid, text, smallint[], smallint, smallint, text) to authenticated;

-- Stop a repeat: the person who set it up, or the workspace's owner or an
-- admin. Runs already made stay as they are.
create or replace function private.stop_mission_repeat(p_repeat_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user uuid := auth.uid();
  v_repeat public.mission_repeats%rowtype;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  select * into v_repeat from public.mission_repeats where id = p_repeat_id;
  if not found or not (v_repeat.created_by = v_user or private.workspace_role(v_repeat.workspace_id, v_user) in ('owner', 'admin')) then
    raise exception 'REPEAT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  update public.mission_repeats set active = false, stopped_at = timezone('utc', now())
   where id = p_repeat_id and active;
  return true;
end;
$function$;
revoke all on function private.stop_mission_repeat(uuid) from public, anon;
grant execute on function private.stop_mission_repeat(uuid) to authenticated;

create or replace function public.stop_mission_repeat(p_repeat_id uuid)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private.stop_mission_repeat(p_repeat_id); $$;
revoke all on function public.stop_mission_repeat(uuid) from public, anon;
grant execute on function public.stop_mission_repeat(uuid) to authenticated;

-- Make today's runs in every workspace the caller belongs to. Returns how
-- many checklists were made. Cheap when there is nothing to do.
create or replace function private.run_due_mission_repeats()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user uuid := auth.uid();
  v_repeat record;
  v_period date;
  v_made integer := 0;
begin
  if v_user is null then return 0; end if;
  for v_repeat in
    select r.*,
           row_number() over (partition by r.created_by order by r.created_at, r.id) as rank_for_creator
      from public.mission_repeats r
     where r.active
       and r.created_by in (
         select r2.created_by from public.mission_repeats r2
          where r2.active and private.is_workspace_member(r2.workspace_id, v_user))
  loop
    -- Runs are made by someone who can edit the workspace (the steps are
    -- written as them); a viewer opening the app waits for an editor.
    if not private.can_edit_workspace(v_repeat.workspace_id, v_user) then continue; end if;
    -- Beyond the creator's plan allowance: wait, unchanged.
    if v_repeat.rank_for_creator > private.repeat_allowance(v_repeat.created_by) then continue; end if;
    v_period := private.repeat_period(v_repeat.frequency, v_repeat.weekdays, v_repeat.weekday, v_repeat.month_day,
                                      (now() at time zone v_repeat.time_zone)::date);
    if v_period is null or v_period < (v_repeat.created_at at time zone v_repeat.time_zone)::date then continue; end if;
    if exists (select 1 from public.mission_repeat_runs where repeat_id = v_repeat.id and period = v_period) then continue; end if;
    perform pg_advisory_xact_lock(hashtext('mission_repeat_run:' || v_repeat.id::text));
    -- One repeat that cannot be made must not stop the others, nor the page.
    begin
      if private.materialize_repeat_run(v_repeat.id, v_period) is not null then
        v_made := v_made + 1;
      end if;
    exception when others then
      raise warning 'repeat % not made for %: %', v_repeat.id, v_period, sqlerrm;
    end;
  end loop;
  return v_made;
end;
$function$;
revoke all on function private.run_due_mission_repeats() from public, anon;
grant execute on function private.run_due_mission_repeats() to authenticated;

create or replace function public.run_due_mission_repeats()
returns integer
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private.run_due_mission_repeats(); $$;
revoke all on function public.run_due_mission_repeats() from public, anon;
grant execute on function public.run_due_mission_repeats() to authenticated;

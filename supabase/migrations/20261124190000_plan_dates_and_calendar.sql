-- Plan dates and a live calendar link (24 Nov 2026).
--
-- 1. A target date for a Mission ("I move in on 1 March") and a due date for
--    each step, so the plan can show a countdown, what is late, and the
--    legal deadlines the guides know (with their official source).
-- 2. A private calendar link per person: Google Calendar, Apple Calendar and
--    Outlook subscribe to it and show the dated steps of the Missions the
--    person chose. How many Missions it can carry depends on the plan:
--    Free 1, Plus 3, Pro and Scale all of them (200 as a safeguard).
--
-- Additive only: four new tables and new functions. The missions and
-- mission_actions tables, their columns and their functions are unchanged;
-- dates live beside them and disappear with them (on delete cascade).
--
-- Who may do what, enforced here:
--   * dates are read by whoever can open the Mission (workspace members) and
--     written only by the Mission's owner, like step proof;
--   * a step's date must belong to a step of the same Mission;
--   * the calendar link is created and replaced only through
--     calendar_feed_token(); nobody can read or write the table directly;
--   * the feed answers only to a well-formed token, returns nothing else, and
--     only Missions the link's owner can still open;
--   * the plan limit is enforced when a Mission is added and again when the
--     feed is read, so after a downgrade the extra Missions pause instead of
--     being deleted.

-- 1. Who can read and who owns a Mission ------------------------------------

create or replace function private.can_read_mission(p_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select exists (
    select 1 from public.missions m
     where m.id = p_mission_id
       and private.is_workspace_member(m.workspace_id, auth.uid())
  );
$function$;

create or replace function private.owns_mission(p_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select exists (
    select 1 from public.missions m
     where m.id = p_mission_id
       and m.owner_id = auth.uid()
       and private.is_workspace_member(m.workspace_id, auth.uid())
  );
$function$;

create or replace function private.action_in_mission(p_action_id uuid, p_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select exists (select 1 from public.mission_actions a where a.id = p_action_id and a.mission_id = p_mission_id);
$function$;

revoke all on function private.can_read_mission(uuid) from public, anon;
revoke all on function private.owns_mission(uuid) from public, anon;
revoke all on function private.action_in_mission(uuid, uuid) from public, anon;
grant execute on function private.can_read_mission(uuid) to authenticated;
grant execute on function private.owns_mission(uuid) to authenticated;
grant execute on function private.action_in_mission(uuid, uuid) to authenticated;

-- 2. Dates ----------------------------------------------------------------------

create table if not exists public.mission_schedules (
  mission_id uuid primary key references public.missions (id) on delete cascade,
  target_date date not null
    constraint mission_schedules_target_range check (target_date between date '2000-01-01' and date '2100-12-31'),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.action_due_dates (
  action_id uuid primary key references public.mission_actions (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  due_on date not null
    constraint action_due_dates_range check (due_on between date '2000-01-01' and date '2100-12-31'),
  -- 'law' when the date was set from a legal deadline a guide cites.
  basis text
    constraint action_due_dates_basis check (basis is null or basis = 'law'),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists action_due_dates_mission on public.action_due_dates (mission_id);

drop trigger if exists mission_schedules_set_updated_at on public.mission_schedules;
create trigger mission_schedules_set_updated_at before update on public.mission_schedules
for each row execute function private.set_updated_at();
drop trigger if exists action_due_dates_set_updated_at on public.action_due_dates;
create trigger action_due_dates_set_updated_at before update on public.action_due_dates
for each row execute function private.set_updated_at();

alter table public.mission_schedules enable row level security;
alter table public.action_due_dates enable row level security;

revoke all on public.mission_schedules from public, anon, authenticated;
revoke all on public.action_due_dates from public, anon, authenticated;
grant select, delete on public.mission_schedules to authenticated;
grant insert (mission_id, target_date) on public.mission_schedules to authenticated;
grant update (target_date) on public.mission_schedules to authenticated;
grant select, delete on public.action_due_dates to authenticated;
grant insert (action_id, mission_id, due_on, basis) on public.action_due_dates to authenticated;
grant update (due_on, basis) on public.action_due_dates to authenticated;

drop policy if exists mission_schedules_read on public.mission_schedules;
create policy mission_schedules_read on public.mission_schedules
  for select to authenticated using (private.can_read_mission(mission_id));
drop policy if exists mission_schedules_insert_owner on public.mission_schedules;
create policy mission_schedules_insert_owner on public.mission_schedules
  for insert to authenticated with check (private.owns_mission(mission_id));
drop policy if exists mission_schedules_update_owner on public.mission_schedules;
create policy mission_schedules_update_owner on public.mission_schedules
  for update to authenticated using (private.owns_mission(mission_id)) with check (private.owns_mission(mission_id));
drop policy if exists mission_schedules_delete_owner on public.mission_schedules;
create policy mission_schedules_delete_owner on public.mission_schedules
  for delete to authenticated using (private.owns_mission(mission_id));

drop policy if exists action_due_dates_read on public.action_due_dates;
create policy action_due_dates_read on public.action_due_dates
  for select to authenticated using (private.can_read_mission(mission_id));
drop policy if exists action_due_dates_insert_owner on public.action_due_dates;
create policy action_due_dates_insert_owner on public.action_due_dates
  for insert to authenticated
  with check (private.owns_mission(mission_id) and private.action_in_mission(action_id, mission_id));
drop policy if exists action_due_dates_update_owner on public.action_due_dates;
create policy action_due_dates_update_owner on public.action_due_dates
  for update to authenticated
  using (private.owns_mission(mission_id))
  with check (private.owns_mission(mission_id) and private.action_in_mission(action_id, mission_id));
drop policy if exists action_due_dates_delete_owner on public.action_due_dates;
create policy action_due_dates_delete_owner on public.action_due_dates
  for delete to authenticated using (private.owns_mission(mission_id));

-- 3. The calendar link ------------------------------------------------------------

-- Missions a person's calendar link carries: Free 1, Plus 3, Pro and Scale
-- all of them, with 200 as a storage safeguard. For the caller only.
create or replace function private.calendar_mission_limit_for(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select case coalesce((select e.plan from public.ai_entitlements e where e.user_id = p_user_id), 'free')
           when 'pro' then 200
           when 'scale' then 200
           when 'plus' then 3
           else 1
         end;
$function$;

revoke all on function private.calendar_mission_limit_for(uuid) from public, anon, authenticated;

create or replace function private.calendar_mission_limit()
returns integer
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select private.calendar_mission_limit_for(auth.uid());
$function$;

revoke all on function private.calendar_mission_limit() from public, anon;
grant execute on function private.calendar_mission_limit() to authenticated;

create table if not exists public.calendar_feeds (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique
    constraint calendar_feeds_token_shape check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.calendar_feeds enable row level security;
-- No direct access at all: the link is read and replaced through
-- calendar_feed_token(), and the feed reads it through calendar_feed_events().
revoke all on public.calendar_feeds from public, anon, authenticated;

create table if not exists public.calendar_missions (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  -- clock_timestamp, not now(): Missions added in one transaction keep the
  -- order they were added in, which decides which ones pause on a downgrade.
  added_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, mission_id)
);

create index if not exists calendar_missions_mission on public.calendar_missions (mission_id);

alter table public.calendar_missions enable row level security;
revoke all on public.calendar_missions from public, anon, authenticated;
grant select, delete on public.calendar_missions to authenticated;
grant insert (mission_id) on public.calendar_missions to authenticated;

drop policy if exists calendar_missions_read_own on public.calendar_missions;
create policy calendar_missions_read_own on public.calendar_missions
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists calendar_missions_insert_own on public.calendar_missions;
create policy calendar_missions_insert_own on public.calendar_missions
  for insert to authenticated
  with check (owner_id = auth.uid() and private.can_read_mission(mission_id));
drop policy if exists calendar_missions_delete_own on public.calendar_missions;
create policy calendar_missions_delete_own on public.calendar_missions
  for delete to authenticated using (owner_id = auth.uid());

create or replace function private.enforce_calendar_mission_limit()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended('calendar_missions:' || new.owner_id::text, 0));
  if (select count(*) from public.calendar_missions c where c.owner_id = new.owner_id)
     >= private.calendar_mission_limit_for(new.owner_id) then
    raise exception 'CALENDAR_LIMIT_REACHED' using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_calendar_mission_limit() from public, anon, authenticated;

drop trigger if exists calendar_missions_limit on public.calendar_missions;
create trigger calendar_missions_limit
before insert on public.calendar_missions
for each row execute function private.enforce_calendar_mission_limit();

-- The caller's link token, created on first use; p_rotate replaces it, so
-- every calendar subscribed to the old link stops receiving anything.
-- 64 hex characters from two random UUIDs: 244 random bits.
create or replace function public.calendar_feed_token(p_rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user uuid := auth.uid();
  v_token text;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not coalesce(p_rotate, false) then
    select f.token into v_token from public.calendar_feeds f where f.owner_id = v_user;
    if v_token is not null then
      return v_token;
    end if;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.calendar_feeds (owner_id, token) values (v_user, v_token)
  on conflict (owner_id) do update set token = excluded.token, created_at = timezone('utc', now());
  return v_token;
end;
$function$;

revoke all on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;

-- What a calendar link shows: for each Mission the owner chose, within the
-- plan's limit (oldest first) and still open to them, one row for the
-- target date and one per dated step that was not cancelled. Anyone holding
-- the link can call it, as with any calendar's secret address; a malformed
-- or unknown token returns no rows.
create or replace function public.calendar_feed_events(p_token text)
returns table (
  mission_id uuid,
  objective text,
  target_date date,
  action_id uuid,
  action_title text,
  action_status text,
  due_on date,
  basis text,
  action_position integer
)
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_owner uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select f.owner_id into v_owner from public.calendar_feeds f where f.token = p_token;
  if v_owner is null then
    return;
  end if;

  return query
  with chosen as (
    select c.mission_id
      from public.calendar_missions c
      join public.missions m on m.id = c.mission_id
     where c.owner_id = v_owner
       and private.is_workspace_member(m.workspace_id, v_owner)
     order by c.added_at, c.mission_id
     limit private.calendar_mission_limit_for(v_owner)
  )
  select m.id, m.objective, s.target_date, null::uuid, null::text, null::text, null::date, null::text, null::integer
    from chosen
    join public.missions m on m.id = chosen.mission_id
    join public.mission_schedules s on s.mission_id = m.id
  union all
  select m.id, m.objective, s.target_date, a.id, a.title, a.status, d.due_on, d.basis, a.position
    from chosen
    join public.missions m on m.id = chosen.mission_id
    join public.action_due_dates d on d.mission_id = m.id
    join public.mission_actions a on a.id = d.action_id and a.mission_id = m.id
    left join public.mission_schedules s on s.mission_id = m.id
   where a.status <> 'CANCELLED';
end;
$function$;

revoke all on function public.calendar_feed_events(text) from public;
grant execute on function public.calendar_feed_events(text) to anon, authenticated;

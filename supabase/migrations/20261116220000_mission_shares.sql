-- Shared mission results.
--
-- A person can publish a copy of one mission's public face under an
-- unguessable link, and withdraw it. The copy is built and filtered by the
-- server (lib/mission-share.mjs) and stored here; the public page reads only
-- this copy, never the mission, its workspace or its owner.
--
-- Before this, the result travelled inside the link itself. That could not
-- be withdrawn or counted, and anyone could write a link that showed any
-- text as a ZAVQERA result.

create table if not exists private.mission_shares (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  views integer not null default 0 check (views >= 0),
  remixes integer not null default 0 check (remixes >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);
-- One live link per mission, so sharing again refreshes the same link.
create unique index if not exists mission_shares_one_live_uidx
  on private.mission_shares (mission_id) where revoked_at is null;

revoke all on private.mission_shares from public, anon, authenticated;

create or replace function private.create_mission_share(p_mission_id uuid, p_snapshot jsonb)
returns uuid
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_workspace_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select m.workspace_id into v_workspace_id from public.missions m where m.id = p_mission_id;
  if v_workspace_id is null or not private.can_edit_workspace(v_workspace_id) then
    raise exception 'MISSION_SHARE_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
     or jsonb_typeof(p_snapshot->'name') is distinct from 'string'
     or jsonb_typeof(p_snapshot->'intent') is distinct from 'string'
     or octet_length(p_snapshot::text) > 8000 then
    raise exception 'INVALID_MISSION_SHARE' using errcode = '22023';
  end if;

  update private.mission_shares
     set snapshot = p_snapshot, updated_at = timezone('utc', now())
   where mission_id = p_mission_id and revoked_at is null
   returning id into v_id;
  if v_id is null then
    insert into private.mission_shares (mission_id, created_by, snapshot)
    values (p_mission_id, auth.uid(), p_snapshot)
    on conflict (mission_id) where revoked_at is null
      do update set snapshot = excluded.snapshot, updated_at = timezone('utc', now())
    returning id into v_id;
  end if;
  return v_id;
end;
$function$;

create or replace function private.revoke_mission_share(p_mission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_workspace_id uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select m.workspace_id into v_workspace_id from public.missions m where m.id = p_mission_id;
  if v_workspace_id is null or not private.can_edit_workspace(v_workspace_id) then
    raise exception 'MISSION_SHARE_NOT_ALLOWED' using errcode = '42501';
  end if;
  update private.mission_shares
     set revoked_at = timezone('utc', now())
   where mission_id = p_mission_id and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

-- What the mission's own page shows: the live link, and how it is doing.
create or replace function private.mission_share_status(p_mission_id uuid)
returns table (id uuid, views integer, remixes integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_workspace_id uuid;
begin
  select m.workspace_id into v_workspace_id from public.missions m where m.id = p_mission_id;
  if auth.uid() is null or v_workspace_id is null or not private.is_workspace_member(v_workspace_id) then
    return;
  end if;
  return query
  select s.id, s.views, s.remixes, s.updated_at
    from private.mission_shares s
   where s.mission_id = p_mission_id and s.revoked_at is null;
end;
$function$;

-- The public read: the stored copy and nothing else.
create or replace function private.get_mission_share(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select s.snapshot from private.mission_shares s where s.id = p_id and s.revoked_at is null;
$function$;

-- Counts a view or a remix of a live share. Anyone can call it, so the
-- numbers are an indication, not an audit.
create or replace function private.record_mission_share_event(p_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
begin
  if p_kind = 'view' then
    update private.mission_shares set views = views + 1 where id = p_id and revoked_at is null;
  elsif p_kind = 'remix' then
    update private.mission_shares set remixes = remixes + 1 where id = p_id and revoked_at is null;
  end if;
end;
$function$;

create or replace function public.create_mission_share(p_mission_id uuid, p_snapshot jsonb)
returns uuid language sql set search_path = 'pg_catalog', 'public'
as $function$ select private.create_mission_share(p_mission_id, p_snapshot); $function$;

create or replace function public.revoke_mission_share(p_mission_id uuid)
returns boolean language sql set search_path = 'pg_catalog', 'public'
as $function$ select private.revoke_mission_share(p_mission_id); $function$;

create or replace function public.mission_share_status(p_mission_id uuid)
returns table (id uuid, views integer, remixes integer, updated_at timestamptz)
language sql set search_path = 'pg_catalog', 'public'
as $function$ select * from private.mission_share_status(p_mission_id); $function$;

-- anon has no usage on the private schema, so the two public entry points
-- that anyone may call run as their owner.
create or replace function public.get_mission_share(p_id uuid)
returns jsonb language sql stable security definer set search_path = 'pg_catalog', 'public', 'private'
as $function$ select private.get_mission_share(p_id); $function$;

create or replace function public.record_mission_share_event(p_id uuid, p_kind text)
returns void language sql security definer set search_path = 'pg_catalog', 'public', 'private'
as $function$ select private.record_mission_share_event(p_id, p_kind); $function$;

revoke all on function private.create_mission_share(uuid, jsonb) from public, anon;
revoke all on function private.revoke_mission_share(uuid) from public, anon;
revoke all on function private.mission_share_status(uuid) from public, anon;
revoke all on function public.create_mission_share(uuid, jsonb) from public, anon;
revoke all on function public.revoke_mission_share(uuid) from public, anon;
revoke all on function public.mission_share_status(uuid) from public, anon;
revoke all on function private.get_mission_share(uuid) from public, anon, authenticated;
revoke all on function private.record_mission_share_event(uuid, text) from public, anon, authenticated;
revoke all on function public.get_mission_share(uuid) from public;
revoke all on function public.record_mission_share_event(uuid, text) from public;

grant execute on function private.create_mission_share(uuid, jsonb) to authenticated;
grant execute on function private.revoke_mission_share(uuid) to authenticated;
grant execute on function private.mission_share_status(uuid) to authenticated;
grant execute on function public.create_mission_share(uuid, jsonb) to authenticated;
grant execute on function public.revoke_mission_share(uuid) to authenticated;
grant execute on function public.mission_share_status(uuid) to authenticated;
grant execute on function public.get_mission_share(uuid) to anon, authenticated;
grant execute on function public.record_mission_share_event(uuid, text) to anon, authenticated;

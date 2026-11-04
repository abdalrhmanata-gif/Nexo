create schema if not exists private;

create table if not exists private.anonymous_ai_visitors (
  visitor_hash text primary key,
  status text not null default 'available' check (status in ('available','reserved','consumed')),
  reservation_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  consumed_at timestamptz
);

create table if not exists private.anonymous_ai_ip_windows (
  ip_hash text not null,
  window_start date not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (ip_hash, window_start)
);

create table if not exists private.anonymous_ai_reservations (
  id uuid primary key default gen_random_uuid(),
  visitor_hash text not null references private.anonymous_ai_visitors(visitor_hash) on delete cascade,
  request_id uuid not null unique,
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists anonymous_ai_reservations_visitor_idx
  on private.anonymous_ai_reservations(visitor_hash, created_at desc);

create or replace function private.reserve_anonymous_ai_generation(
  p_visitor_hash text,
  p_ip_hash text,
  p_request_id uuid
)
returns table(
  allowed boolean,
  reservation_id uuid,
  remaining integer,
  reason text
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_visitor private.anonymous_ai_visitors%rowtype;
  v_attempts integer;
  v_reservation uuid;
begin
  if length(coalesce(p_visitor_hash, '')) <> 64
     or length(coalesce(p_ip_hash, '')) <> 64 then
    return query select false, null::uuid, 0, 'invalid_identity';
    return;
  end if;

  insert into private.anonymous_ai_visitors(visitor_hash)
  values (p_visitor_hash)
  on conflict (visitor_hash) do update
    set last_seen_at = now()
  returning * into v_visitor;

  select *
    into v_visitor
    from private.anonymous_ai_visitors
   where visitor_hash = p_visitor_hash
   for update;

  if v_visitor.status <> 'available' then
    return query select false, null::uuid, 0, 'already_used';
    return;
  end if;

  insert into private.anonymous_ai_ip_windows(ip_hash, window_start, attempts)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, window_start) do update
    set attempts = private.anonymous_ai_ip_windows.attempts + 1
   where private.anonymous_ai_ip_windows.attempts < 5
  returning attempts into v_attempts;

  if v_attempts is null then
    return query select false, null::uuid, 0, 'ip_limit';
    return;
  end if;

  v_reservation := gen_random_uuid();

  insert into private.anonymous_ai_reservations(id, visitor_hash, request_id)
  values (v_reservation, p_visitor_hash, p_request_id);

  update private.anonymous_ai_visitors
     set status = 'reserved', reservation_id = v_reservation, last_seen_at = now()
   where visitor_hash = p_visitor_hash;

  return query select true, v_reservation, 0, null::text;
end;
$$;

create or replace function private.consume_anonymous_ai_generation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_visitor_hash text;
  v_updated integer;
begin
  update private.anonymous_ai_reservations
     set status = 'consumed', settled_at = now()
   where id = p_reservation_id and status = 'reserved'
   returning visitor_hash into v_visitor_hash;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return false;
  end if;

  update private.anonymous_ai_visitors
     set status = 'consumed', consumed_at = now(), reservation_id = p_reservation_id, last_seen_at = now()
   where visitor_hash = v_visitor_hash;

  return true;
end;
$$;

create or replace function private.release_anonymous_ai_generation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_visitor_hash text;
  v_updated integer;
begin
  update private.anonymous_ai_reservations
     set status = 'released', settled_at = now()
   where id = p_reservation_id and status = 'reserved'
   returning visitor_hash into v_visitor_hash;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return false;
  end if;

  update private.anonymous_ai_visitors
     set status = 'available', reservation_id = null, last_seen_at = now()
   where visitor_hash = v_visitor_hash;

  return true;
end;
$$;

revoke all on table private.anonymous_ai_visitors from public, anon, authenticated;
revoke all on table private.anonymous_ai_ip_windows from public, anon, authenticated;
revoke all on table private.anonymous_ai_reservations from public, anon, authenticated;
revoke all on function private.reserve_anonymous_ai_generation(text, text, uuid) from public, anon, authenticated;
revoke all on function private.consume_anonymous_ai_generation(uuid) from public, anon, authenticated;
revoke all on function private.release_anonymous_ai_generation(uuid) from public, anon, authenticated;

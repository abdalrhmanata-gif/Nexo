-- W55 keeps only the minimum signals needed to measure repeat mission creation and template shares.
create table if not exists public.product_growth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('template_shared', 'second_mission_created')),
  template_id text,
  created_at timestamptz not null default now(),
  constraint product_growth_events_event_shape_check check (
    (event_type = 'template_shared' and template_id is not null and template_id ~ '^[a-z0-9-]{1,80}$')
    or (event_type = 'second_mission_created' and template_id is null)
  )
);
create unique index if not exists product_growth_template_shared_once_idx
  on public.product_growth_events (user_id, template_id) where event_type = 'template_shared';
create unique index if not exists product_growth_second_mission_once_idx
  on public.product_growth_events (user_id) where event_type = 'second_mission_created';

alter table public.product_growth_events enable row level security;
revoke all on public.product_growth_events from public, anon;
grant select, insert on public.product_growth_events to authenticated;

create policy product_growth_events_select_own
  on public.product_growth_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy product_growth_events_insert_template_share
  on public.product_growth_events for insert to authenticated
  with check (user_id = (select auth.uid()) and event_type = 'template_shared' and template_id is not null);

create or replace function private.record_second_mission_conversion()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare owned_mission_count bigint;
begin
  if new.owner_id is null then return new; end if;
  select count(*) into owned_mission_count from public.missions as mission where mission.owner_id = new.owner_id;
  if owned_mission_count >= 2 then
    insert into public.product_growth_events (user_id, event_type)
    values (new.owner_id, 'second_mission_created') on conflict do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function private.record_second_mission_conversion() from public, anon, authenticated;
drop trigger if exists missions_record_second_mission_conversion on public.missions;
create trigger missions_record_second_mission_conversion
  after insert on public.missions for each row execute function private.record_second_mission_conversion();

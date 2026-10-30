-- Replay-compatibility baseline for the verification/outcome audit tables.
-- This migration was missing from the repository history even though the
-- Development database already contains these tables. It is additive and
-- idempotent, and is used by disposable PG17 replay tests. It is NOT a
-- rewrite of any already-applied migration.

create schema if not exists private;

create table if not exists public.mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 100),
  actor_type text not null check (actor_type in ('USER', 'SYSTEM')),
  actor_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.mission_verifications (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'VERIFIED', 'FAILED')),
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  confidence numeric null check (confidence is null or confidence between 0 and 1),
  failure_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null
);

create table if not exists public.mission_outcomes (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  verification_id uuid not null references public.mission_verifications(id) on delete restrict,
  status text not null default 'COMPLETED' check (status in ('COMPLETED', 'FAILED')),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  success_score numeric not null check (success_score between 0 and 1),
  verified boolean not null default true check (verified = true),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists mission_outcomes_verification_uidx
  on public.mission_outcomes (verification_id);
create index if not exists mission_events_mission_created_idx
  on public.mission_events (mission_id, created_at desc);
create index if not exists mission_events_owner_created_idx
  on public.mission_events (owner_id, created_at desc);
create index if not exists mission_verifications_mission_created_idx
  on public.mission_verifications (mission_id, created_at desc);
create index if not exists mission_outcomes_mission_created_idx
  on public.mission_outcomes (mission_id, created_at desc);

alter table public.mission_events enable row level security;
alter table public.mission_verifications enable row level security;
alter table public.mission_outcomes enable row level security;

revoke all privileges on table public.mission_events, public.mission_verifications, public.mission_outcomes from anon, authenticated;
grant select on table public.mission_events, public.mission_verifications, public.mission_outcomes to authenticated;

drop policy if exists mission_events_select_own on public.mission_events;
create policy mission_events_select_own
on public.mission_events for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists mission_verifications_select_own on public.mission_verifications;
create policy mission_verifications_select_own
on public.mission_verifications for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists mission_outcomes_select_own on public.mission_outcomes;
create policy mission_outcomes_select_own
on public.mission_outcomes for select to authenticated
using (owner_id = (select auth.uid()));

create or replace function private.block_mission_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '42501', message = 'Mission history is append-only';
end;
$$;

revoke all privileges on function private.block_mission_history_mutation() from public, anon, authenticated;

drop trigger if exists mission_events_append_only on public.mission_events;
create trigger mission_events_append_only
before update or delete on public.mission_events
for each row execute function private.block_mission_history_mutation();

drop trigger if exists mission_verifications_append_only on public.mission_verifications;
create trigger mission_verifications_append_only
before update or delete on public.mission_verifications
for each row execute function private.block_mission_history_mutation();

drop trigger if exists mission_outcomes_append_only on public.mission_outcomes;
create trigger mission_outcomes_append_only
before update or delete on public.mission_outcomes
for each row execute function private.block_mission_history_mutation();

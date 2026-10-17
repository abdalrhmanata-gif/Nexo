create table if not exists public.mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 100),
  actor_type text not null check (actor_type in ('USER','SYSTEM')),
  actor_id uuid null references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.mission_verifications (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','FAILED')),
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  failure_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null
);

create table if not exists public.mission_outcomes (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  verification_id uuid not null references public.mission_verifications(id) on delete restrict,
  status text not null default 'COMPLETED' check (status in ('COMPLETED','FAILED')),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  success_score numeric not null check (success_score >= 0 and success_score <= 1),
  verified boolean not null default true check (verified is true),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists mission_events_mission_created_idx
  on public.mission_events(mission_id, created_at desc);

create index if not exists mission_events_owner_created_idx
  on public.mission_events(owner_id, created_at desc);

create index if not exists mission_verifications_mission_created_idx
  on public.mission_verifications(mission_id, created_at desc);

create index if not exists mission_outcomes_mission_created_idx
  on public.mission_outcomes(mission_id, created_at desc);

create unique index if not exists mission_outcomes_verification_uidx
  on public.mission_outcomes(verification_id);

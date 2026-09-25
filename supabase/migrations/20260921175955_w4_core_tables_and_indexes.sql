create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  objective text not null check (char_length(btrim(objective)) between 1 and 10000),
  status text not null default 'DRAFT' check (status in (
    'DRAFT','PLANNING','READY','RUNNING','WAITING','NEEDS_USER',
    'VERIFYING','COMPLETED','PAUSED','BLOCKED','FAILED','CANCELLED'
  )),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.mission_actions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 2000),
  position integer not null check (position >= 0),
  status text not null default 'PENDING' check (status in (
    'PENDING','RUNNING','COMPLETED','BLOCKED','CANCELLED'
  )),
  follow_up_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint mission_actions_mission_position_key unique (mission_id, position)
);

create index workspaces_owner_id_idx on public.workspaces(owner_id);
create index missions_workspace_id_idx on public.missions(workspace_id);
create index missions_owner_id_idx on public.missions(owner_id);
create index mission_actions_mission_id_idx on public.mission_actions(mission_id);
create index mission_actions_follow_up_at_idx on public.mission_actions(follow_up_at)
  where follow_up_at is not null;

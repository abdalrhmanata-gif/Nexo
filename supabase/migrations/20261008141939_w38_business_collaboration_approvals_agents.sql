create table if not exists public.workspace_members (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check (role in ('owner','admin','member','viewer')), created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()), unique(workspace_id,user_id));
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists workspace_members_workspace_idx on public.workspace_members(workspace_id);
create table if not exists public.workspace_agents (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 120), description text not null default '' check (char_length(description)<=2000),
 status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED')), authority jsonb not null default '{}'::jsonb check (jsonb_typeof(authority)='object'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()));
create index if not exists workspace_agents_workspace_idx on public.workspace_agents(workspace_id);
create table if not exists public.mission_approvals (
 id uuid primary key default gen_random_uuid(), mission_id uuid not null references public.missions(id) on delete cascade, workspace_id uuid not null references public.workspaces(id) on delete cascade,
 action_id uuid references public.mission_actions(id) on delete set null, requested_by uuid not null references auth.users(id), decided_by uuid references auth.users(id),
 status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')), requested_scope jsonb not null default '{}'::jsonb check (jsonb_typeof(requested_scope)='object'),
 decision_note text check (decision_note is null or char_length(decision_note)<=4000), created_at timestamptz not null default timezone('utc',now()), decided_at timestamptz);
create index if not exists mission_approvals_mission_idx on public.mission_approvals(mission_id,created_at desc);
create index if not exists mission_approvals_workspace_idx on public.mission_approvals(workspace_id,status);
alter table public.missions add column if not exists agent_id uuid references public.workspace_agents(id) on delete set null;
create index if not exists missions_agent_idx on public.missions(agent_id);
alter table public.workspace_members enable row level security;
alter table public.workspace_agents enable row level security;
alter table public.mission_approvals enable row level security;
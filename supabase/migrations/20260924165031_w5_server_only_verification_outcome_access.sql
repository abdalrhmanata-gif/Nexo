alter table public.mission_events enable row level security;
alter table public.mission_verifications enable row level security;
alter table public.mission_outcomes enable row level security;

revoke all privileges on table public.mission_events, public.mission_verifications, public.mission_outcomes
  from anon, authenticated;

grant select on table public.mission_events, public.mission_verifications, public.mission_outcomes
  to authenticated;

drop policy if exists mission_events_select_own on public.mission_events;
create policy mission_events_select_own on public.mission_events
for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists mission_verifications_select_own on public.mission_verifications;
create policy mission_verifications_select_own on public.mission_verifications
for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists mission_outcomes_select_own on public.mission_outcomes;
create policy mission_outcomes_select_own on public.mission_outcomes
for select to authenticated
using (owner_id = (select auth.uid()));

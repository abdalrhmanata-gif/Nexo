alter table public.mission_events enable row level security;
alter table public.mission_verifications enable row level security;
alter table public.mission_outcomes enable row level security;

revoke all privileges on table public.mission_events from anon, authenticated;
revoke all privileges on table public.mission_verifications from anon, authenticated;
revoke all privileges on table public.mission_outcomes from anon, authenticated;

grant select on table public.mission_events to authenticated;
grant select on table public.mission_verifications to authenticated;
grant select on table public.mission_outcomes to authenticated;

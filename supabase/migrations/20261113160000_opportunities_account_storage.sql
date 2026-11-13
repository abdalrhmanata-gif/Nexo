-- Opportunities move from the browser to the account.
--
-- Until now the opportunities a person scored, and the evidence notes they
-- attached, lived only in that browser's localStorage. Missions were in the
-- database; opportunities were not. So an opportunity recorded on one device
-- did not appear on another, and clearing browser data erased it.
--
-- This migration is additive only: two new tables, their policies and one
-- trigger function. No existing table, policy, function or row is touched.
--
-- Ownership is the signed-in user, taken from the session (auth.uid()) and
-- never from the request body. The primary key starts with user_id rather
-- than being the opportunity id alone: ids are generated in the browser and
-- travel in backup files, so two accounts can legitimately hold the same id.
-- With a global key, the second account's insert would fail — and the failure
-- would reveal that someone else holds that id.

create table if not exists public.opportunities (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and btrim(id) <> ''),
  title text not null check (char_length(title) <= 100 and btrim(title) <> ''),
  target text not null default '' check (char_length(target) <= 160),
  thesis text not null check (char_length(thesis) <= 1200 and btrim(thesis) <> ''),
  -- The link is shown as a link, so its scheme is held to http(s) here as
  -- well as in the browser. The pattern is deliberately no stricter than the
  -- browser's own URL parser, so one unusual-but-valid link cannot fail a
  -- whole upload.
  evidence_url text not null default '' check (
    char_length(evidence_url) <= 500
    and (evidence_url = '' or evidence_url ~* '^\s*https?:')
  ),
  strategic_fit smallint not null check (strategic_fit between 1 and 5),
  potential_value smallint not null check (potential_value between 1 and 5),
  urgency smallint not null check (urgency between 1 and 5),
  evidence_strength smallint not null check (evidence_strength between 1 and 5),
  effort smallint not null check (effort between 1 and 5),
  -- When the person recorded it, as the browser saw it (milliseconds since
  -- the epoch). Kept as given so a record keeps its place in the ranking and
  -- in a backup file after it moves here.
  created_at_ms bigint not null check (created_at_ms >= 0),
  stored_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

comment on table public.opportunities is
  'Opportunities a user scored in Opportunity Intelligence. Private to the owning user through row level security.';

create table if not exists public.opportunity_evidence_items (
  user_id uuid not null default auth.uid(),
  opportunity_id text not null,
  id text not null check (char_length(id) between 1 and 128 and btrim(id) <> ''),
  url text not null check (char_length(url) <= 500 and url ~* '^\s*https?:'),
  title text not null check (char_length(title) <= 180 and btrim(title) <> ''),
  observation text not null check (char_length(observation) <= 1200 and btrim(observation) <> ''),
  stance text not null check (stance in ('supports', 'challenges', 'context')),
  source_type text not null check (source_type in ('official', 'news', 'research', 'customer', 'competitor', 'other')),
  source_date text not null default '' check (char_length(source_date) <= 50),
  reliability smallint not null check (reliability between 1 and 5),
  checked_at text not null check (char_length(checked_at) between 1 and 100),
  added_at_ms bigint not null check (added_at_ms >= 0),
  stored_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, opportunity_id, id),
  -- The evidence belongs to the same user's opportunity, and goes when the
  -- opportunity goes. Because user_id is part of the reference, a note can
  -- never be attached to another account's opportunity.
  foreign key (user_id, opportunity_id)
    references public.opportunities (user_id, id) on delete cascade
);

comment on table public.opportunity_evidence_items is
  'Evidence notes attached to a user''s opportunity. Private to the owning user through row level security.';

alter table public.opportunities enable row level security;
alter table public.opportunity_evidence_items enable row level security;

-- Deny by default: nothing for anon, and for a signed-in user only what the
-- page does — read, add, remove. There is no edit in the product, so there is
-- no UPDATE privilege and no UPDATE policy.
revoke all on table public.opportunities from public, anon, authenticated;
revoke all on table public.opportunity_evidence_items from public, anon, authenticated;
grant select, insert, delete on table public.opportunities to authenticated;
grant select, insert, delete on table public.opportunity_evidence_items to authenticated;

drop policy if exists opportunities_select_own on public.opportunities;
create policy opportunities_select_own on public.opportunities
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists opportunities_insert_own on public.opportunities;
create policy opportunities_insert_own on public.opportunities
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists opportunities_delete_own on public.opportunities;
create policy opportunities_delete_own on public.opportunities
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists opportunity_evidence_items_select_own on public.opportunity_evidence_items;
create policy opportunity_evidence_items_select_own on public.opportunity_evidence_items
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists opportunity_evidence_items_insert_own on public.opportunity_evidence_items;
create policy opportunity_evidence_items_insert_own on public.opportunity_evidence_items
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists opportunity_evidence_items_delete_own on public.opportunity_evidence_items;
create policy opportunity_evidence_items_delete_own on public.opportunity_evidence_items
for delete to authenticated
using (user_id = (select auth.uid()));

-- The same ceilings the backup format already enforces in the browser
-- (1000 opportunities, 200 evidence notes each), held here as well so that
-- storage cannot be filled by calling the API directly. The function runs as
-- the caller, so it counts only what the caller's own policies let them see.
create or replace function public.enforce_opportunity_storage_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'opportunities' then
    if (select count(*) from public.opportunities o where o.user_id = new.user_id) >= 1000 then
      raise exception 'An account can hold at most 1000 opportunities.'
        using errcode = 'check_violation';
    end if;
  else
    if (select count(*) from public.opportunity_evidence_items e
        where e.user_id = new.user_id and e.opportunity_id = new.opportunity_id) >= 200 then
      raise exception 'An opportunity can hold at most 200 evidence notes.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_opportunity_storage_limits() from public, anon, authenticated;

drop trigger if exists opportunities_storage_limit on public.opportunities;
create trigger opportunities_storage_limit
before insert on public.opportunities
for each row execute function public.enforce_opportunity_storage_limits();

drop trigger if exists opportunity_evidence_items_storage_limit on public.opportunity_evidence_items;
create trigger opportunity_evidence_items_storage_limit
before insert on public.opportunity_evidence_items
for each row execute function public.enforce_opportunity_storage_limits();

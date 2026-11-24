-- Calendar connection status (24 Nov 2026).
--
-- A new user who has added the calendar link cannot tell whether it worked:
-- Apple's subscription screen is unfamiliar and Google takes up to a day.
-- When a calendar app fetches the link, the feed now records when and which
-- kind of app (Apple, Google, Outlook, other), so the page can say
-- "Connected to Apple Calendar, last updated 18:20".
--
-- Additive only: two nullable columns on calendar_feeds (added the same day,
-- no other code reads them) and two functions.

alter table public.calendar_feeds
  add column if not exists last_fetched_at timestamptz,
  add column if not exists last_client text;

alter table public.calendar_feeds
  drop constraint if exists calendar_feeds_last_client_shape,
  add constraint calendar_feeds_last_client_shape
    check (last_client is null or last_client in ('apple', 'google', 'outlook', 'other'));

-- Called by the feed route on each fetch by a calendar app. Anyone holding
-- the link can call it, as anyone holding it can read the feed; it changes
-- nothing but these two columns, at most once a minute, and an unknown or
-- malformed token changes nothing.
create or replace function public.calendar_feed_touch(p_token text, p_client text)
returns void
language sql
volatile
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  update public.calendar_feeds
     set last_fetched_at = timezone('utc', now()),
         last_client = case when p_client in ('apple', 'google', 'outlook') then p_client else 'other' end
   where p_token ~ '^[0-9a-f]{64}$'
     and token = p_token
     and (last_fetched_at is null
          or last_fetched_at < timezone('utc', now()) - interval '1 minute'
          or last_client is distinct from (case when p_client in ('apple', 'google', 'outlook') then p_client else 'other' end));
$function$;

revoke all on function public.calendar_feed_touch(text, text) from public;
grant execute on function public.calendar_feed_touch(text, text) to anon, authenticated;

-- The caller's own connection status; nothing about anyone else.
create or replace function public.calendar_feed_status()
returns table (last_fetched_at timestamptz, last_client text)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  select f.last_fetched_at, f.last_client from public.calendar_feeds f where f.owner_id = auth.uid();
$function$;

revoke all on function public.calendar_feed_status() from public, anon;
grant execute on function public.calendar_feed_status() to authenticated;

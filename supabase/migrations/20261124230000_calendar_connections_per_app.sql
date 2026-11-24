-- Calendar connections, one per app (24 Nov 2026).
--
-- The owner's test on zavqera.com: with Google Calendar and his iPhone both
-- subscribed, the page said only "Connected to Apple Calendar", because
-- calendar_feeds keeps the last app that fetched the link (Google at 18:02
-- was overwritten by Apple at 18:32). It also said so forever, although no
-- calendar app tells us when a subscription is deleted, and still said so
-- after "Replace the link", when the old link no longer reaches anyone.
--
-- Now each kind of app that fetches the link has its own row with its own
-- time, the page can tell an app that still updates from one that stopped,
-- and only apps that fetched the current link are listed: replacing the link
-- resets calendar_feeds.created_at, and an app still holding the old link can
-- no longer record anything.
--
-- Additive: one new table (filled from the two columns it supersedes), one
-- new function, and two functions replaced with the same signatures. The old
-- columns and calendar_feed_status() stay, still written, so the version of
-- the site that is live while this deploys keeps working.

create table if not exists public.calendar_feed_clients (
  owner_id uuid not null references public.calendar_feeds (owner_id) on delete cascade,
  client text not null,
  last_fetched_at timestamptz not null,
  primary key (owner_id, client),
  constraint calendar_feed_clients_client_shape check (client in ('apple', 'google', 'outlook', 'other'))
);

-- Read and written only by the functions below.
alter table public.calendar_feed_clients enable row level security;
revoke all on public.calendar_feed_clients from public, anon, authenticated;

insert into public.calendar_feed_clients (owner_id, client, last_fetched_at)
select f.owner_id, f.last_client, f.last_fetched_at
  from public.calendar_feeds f
 where f.last_client is not null
   and f.last_fetched_at is not null
on conflict (owner_id, client) do nothing;

-- Called by the feed route on each fetch by a calendar app. Anyone holding
-- the link can call it, as anyone holding it can read the feed; it records
-- only which kind of app fetched and when, at most once a minute per app,
-- and an unknown or malformed token records nothing.
create or replace function public.calendar_feed_touch(p_token text, p_client text)
returns void
language plpgsql
volatile
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_owner uuid;
  v_created timestamptz;
  v_client text := case when p_client in ('apple', 'google', 'outlook') then p_client else 'other' end;
  v_now timestamptz := timezone('utc', now());
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select f.owner_id, f.created_at into v_owner, v_created from public.calendar_feeds f where f.token = p_token;
  if v_owner is null then
    return;
  end if;

  insert into public.calendar_feed_clients as c (owner_id, client, last_fetched_at)
  values (v_owner, v_client, v_now)
  on conflict (owner_id, client) do update
    set last_fetched_at = excluded.last_fetched_at
    where c.last_fetched_at < excluded.last_fetched_at - interval '1 minute'
       or c.last_fetched_at < v_created;

  -- Kept for the previous version of the site, which reads only these.
  update public.calendar_feeds
     set last_fetched_at = v_now, last_client = v_client
   where owner_id = v_owner
     and (last_fetched_at is null
          or last_fetched_at < v_now - interval '1 minute'
          or last_client is distinct from v_client);
end;
$function$;

revoke all on function public.calendar_feed_touch(text, text) from public;
grant execute on function public.calendar_feed_touch(text, text) to anon, authenticated;

-- Every app that has fetched the caller's current link, newest first;
-- nothing about anyone else, and nothing from before the link was replaced.
create or replace function public.calendar_feed_connections()
returns table (client text, last_fetched_at timestamptz)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  select c.client, c.last_fetched_at
    from public.calendar_feed_clients c
    join public.calendar_feeds f on f.owner_id = c.owner_id
   where c.owner_id = auth.uid()
     and c.last_fetched_at >= f.created_at
   order by c.last_fetched_at desc;
$function$;

revoke all on function public.calendar_feed_connections() from public, anon;
grant execute on function public.calendar_feed_connections() to authenticated;

-- Same as before; replacing the link also clears the previous status
-- columns. (The per-app rows need nothing: they predate the new created_at.)
create or replace function public.calendar_feed_token(p_rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user uuid := auth.uid();
  v_token text;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not coalesce(p_rotate, false) then
    select f.token into v_token from public.calendar_feeds f where f.owner_id = v_user;
    if v_token is not null then
      return v_token;
    end if;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.calendar_feeds (owner_id, token) values (v_user, v_token)
  on conflict (owner_id) do update
    set token = excluded.token,
        created_at = timezone('utc', now()),
        last_fetched_at = null,
        last_client = null;
  return v_token;
end;
$function$;

revoke all on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;

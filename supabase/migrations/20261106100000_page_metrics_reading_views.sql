-- Reading the counter.
--
-- page_metrics holds one row per page per referrer per day, which is the right
-- shape to write and the wrong shape to read. These views are the questions
-- actually worth asking, so the answer is "select * from metrics_sources"
-- rather than a join written from memory each time.
--
-- None of them are granted to anon or authenticated. page_metrics denies by
-- default, and a view in PostgreSQL runs with its owner's rights unless it is
-- declared security_invoker — so granting one of these to a signed-in user
-- would hand every customer the business's traffic figures.

-- Which pages were opened, over the last 30 days.
create or replace view public.metrics_by_page as
select
  path,
  sum(views)::bigint as views,
  count(distinct day)::int as days_seen,
  max(day) as last_seen
from public.page_metrics
where day >= current_date - 30
group by path
order by views desc;

-- Where people came from, over the last 30 days. "direct" means no referrer
-- was sent: typed in, a bookmark, a link from an app, or a browser that
-- suppresses it. "internal" means they moved between pages on this site.
create or replace view public.metrics_sources as
select
  referrer_host as source,
  sum(views)::bigint as views,
  round(100.0 * sum(views) / nullif(sum(sum(views)) over (), 0), 1) as percent
from public.page_metrics
where day >= current_date - 30
  and referrer_host <> 'internal'
group by referrer_host
order by views desc;

-- One line per day: how many arrived, how many reached the pricing page, how
-- many reached the sign-up form. The two rates are the only numbers that say
-- whether the product is persuading anyone.
create or replace view public.metrics_funnel as
select
  day,
  sum(views) filter (where path = '/')::int as landing,
  sum(views) filter (where path = '/pricing')::int as pricing,
  sum(views) filter (where path = '/auth/sign-up')::int as sign_up,
  round(100.0 * sum(views) filter (where path = '/pricing')
    / nullif(sum(views) filter (where path = '/'), 0), 1) as landing_to_pricing_pct,
  round(100.0 * sum(views) filter (where path = '/auth/sign-up')
    / nullif(sum(views) filter (where path = '/pricing'), 0), 1) as pricing_to_signup_pct
from public.page_metrics
group by day
order by day desc;

-- One page, broken down by where its visitors came from. Answers questions of
-- the form "how many people reached the pricing page from Google".
create or replace view public.metrics_page_sources as
select
  path,
  referrer_host as source,
  sum(views)::bigint as views,
  max(day) as last_seen
from public.page_metrics
group by path, referrer_host
order by path, views desc;

comment on view public.metrics_by_page is 'Pages opened in the last 30 days, busiest first.';
comment on view public.metrics_sources is 'Where visitors came from in the last 30 days, with each source as a percentage.';
comment on view public.metrics_funnel is 'Per day: landing, pricing and sign-up opens, with the two conversion rates.';
comment on view public.metrics_page_sources is 'Every page crossed with every source. Filter by path to answer one page''s question.';

revoke all on public.metrics_by_page from anon, authenticated;
revoke all on public.metrics_sources from anon, authenticated;
revoke all on public.metrics_funnel from anon, authenticated;
revoke all on public.metrics_page_sources from anon, authenticated;

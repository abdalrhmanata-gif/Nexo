-- Cookieless, identifier-free page counting.
--
-- The product had no way to tell whether anyone was using it. The usual answer
-- is a third-party analytics script, which under ekomloven § 2-7b would mean a
-- consent banner, a processor outside the EEA, and a privacy notice that can no
-- longer say "no trackers".
--
-- This stores a daily total per page instead. There is no identifier of any
-- kind: no IP address, no cookie, no session, no fingerprint, nothing written
-- to the visitor's device. A row says "the pricing page was opened 14 times on
-- 6 November, by people who arrived from google.com". No one can be singled out
-- of that, which is why it needs no consent and why the privacy notice can keep
-- its promise.

create table if not exists public.page_metrics (
  day date not null default current_date,
  path text not null,
  referrer_host text not null default 'direct',
  views integer not null default 0,
  primary key (day, path, referrer_host)
);

comment on table public.page_metrics is
  'Daily page-open totals. Contains no personal data: no identifier, no IP, no session. Written only through record_page_view().';

-- Deny by default. Nothing reads this through the API; totals are read by the
-- owner in the SQL editor or through the service role.
alter table public.page_metrics enable row level security;
revoke all on table public.page_metrics from anon, authenticated;

-- The one write surface. SECURITY DEFINER because the table itself must stay
-- closed, and callable by anon because a visitor who has not signed in is
-- exactly the visitor worth counting. It accepts two bounded strings, writes a
-- counter, and returns nothing — there is no read path to abuse and nothing
-- about the caller is recorded.
create or replace function public.record_page_view(p_path text, p_referrer_host text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
  v_host text;
begin
  -- The caller is untrusted. Anything unexpected is dropped rather than stored,
  -- which also caps how many distinct rows this table can ever grow.
  v_path := nullif(btrim(p_path), '');
  if v_path is null or length(v_path) > 64 or v_path !~ '^[a-z0-9/_\[\]-]+$' then
    return;
  end if;

  v_host := nullif(btrim(lower(coalesce(p_referrer_host, ''))), '');
  if v_host is null or length(v_host) > 100 or v_host !~ '^[a-z0-9.-]+$' then
    v_host := 'direct';
  end if;

  insert into public.page_metrics (day, path, referrer_host, views)
  values (current_date, v_path, v_host, 1)
  on conflict (day, path, referrer_host)
  do update set views = public.page_metrics.views + 1;
end;
$$;

comment on function public.record_page_view(text, text) is
  'Increments a daily page counter. Records nothing about the caller. Intentionally callable by anon: an unauthenticated visitor is the one worth counting.';

revoke all on function public.record_page_view(text, text) from public;
grant execute on function public.record_page_view(text, text) to anon, authenticated;

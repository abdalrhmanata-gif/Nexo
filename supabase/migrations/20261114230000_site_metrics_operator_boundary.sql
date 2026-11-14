-- The site's visitor figures are for the people who run the site.
--
-- get_site_metrics() let in any account that was owner or admin of a
-- workspace. Every account becomes the owner of its own workspace when it is
-- created (ensure_personal_workspace), so that test was true for every
-- signed-in customer: any of them could call the function and read page
-- views, traffic sources and the conversion funnel for the whole site.
--
-- Running the site is not a workspace role, so it gets its own list. The list
-- lives in the private schema, which the API does not expose, and carries no
-- grant to anon or authenticated: an account cannot read it and cannot add
-- itself to it. Only the database owner names an operator:
--
--   insert into private.site_admins (user_id) values ('<auth user id>');
--
-- Until that is done the list is empty and the function answers nobody. That
-- is the safe direction for it to fail in.
--
-- Additive apart from the function body: one new table, and the same
-- function with the same name, arguments and result, checking the new list.

create schema if not exists private;

create table if not exists private.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default timezone('utc', now())
);

comment on table private.site_admins is
  'Accounts that run the site and may read its visitor figures. Written only by the database owner.';

alter table private.site_admins enable row level security;
revoke all on table private.site_admins from public, anon, authenticated;

create or replace function public.get_site_metrics()
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  if not exists (
    select 1
    from private.site_admins sa
    where sa.user_id = auth.uid()
  ) then
    raise exception 'ANALYTICS_ADMIN_REQUIRED' using errcode='42501';
  end if;

  select jsonb_build_object(
    'by_page', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.views desc)
      from public.metrics_by_page x
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.views desc)
      from public.metrics_sources x
    ), '[]'::jsonb),
    'funnel', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.day desc)
      from public.metrics_funnel x
    ), '[]'::jsonb),
    'page_sources', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.path, x.views desc)
      from public.metrics_page_sources x
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_site_metrics() from public, anon;
grant execute on function public.get_site_metrics() to authenticated;

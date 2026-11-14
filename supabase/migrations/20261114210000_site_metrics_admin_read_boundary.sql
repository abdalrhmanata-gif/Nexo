-- Site analytics read boundary for the Owner/Admin dashboard.
--
-- The underlying metrics views remain inaccessible to anon/authenticated.
-- This function is the only exposed read path and performs the authorization
-- check before returning the aggregate dashboard payload.

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
    from public.workspace_members wm
    where wm.user_id = auth.uid()
      and wm.role in ('owner','admin')
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

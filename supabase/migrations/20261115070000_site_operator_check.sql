-- A yes-or-no for the menu: is the signed-in account one of the people who
-- run the site?
--
-- The analytics page had no link anywhere; it was reached by typing its
-- address. The menu should offer it to the operators and to nobody else, and
-- the application cannot read private.site_admins itself — that list carries
-- no grant, on purpose. This function answers the one question and reveals
-- nothing else: not who the operators are, not how many there are.
--
-- It is a convenience, not the boundary. get_site_metrics() still checks the
-- list itself on every call, whatever the menu shows.
--
-- Additive: one new function. Nothing existing is changed.

create or replace function public.is_site_operator()
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog','public','private'
as $$
  select exists (
    select 1 from private.site_admins sa where sa.user_id = auth.uid()
  );
$$;

revoke all on function public.is_site_operator() from public, anon;
grant execute on function public.is_site_operator() to authenticated;

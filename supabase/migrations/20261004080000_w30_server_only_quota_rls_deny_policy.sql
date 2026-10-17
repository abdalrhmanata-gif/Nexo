-- W30: make server-only AI quota tables explicitly deny-by-default at the RLS layer.
create policy "deny_direct_access" on public.ai_entitlements
  for all to public
  using (false)
  with check (false);

create policy "deny_direct_access" on public.ai_usage_monthly
  for all to public
  using (false)
  with check (false);

create policy "deny_direct_access" on public.ai_usage_reservations
  for all to public
  using (false)
  with check (false);

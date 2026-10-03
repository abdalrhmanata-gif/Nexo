-- W22 privilege hardening: expose usage functions only to authenticated callers.

revoke all on public.ai_entitlements from public, anon, authenticated;
revoke all on public.ai_usage_monthly from public, anon, authenticated;
revoke all on public.ai_usage_reservations from public, anon, authenticated;

revoke execute on function public.get_ai_usage() from public, anon;
revoke execute on function public.reserve_ai_generation(text) from public, anon;
revoke execute on function public.consume_ai_generation(uuid) from public, anon;
revoke execute on function public.release_ai_generation(uuid) from public, anon;

grant execute on function public.get_ai_usage() to authenticated;
grant execute on function public.reserve_ai_generation(text) to authenticated;
grant execute on function public.consume_ai_generation(uuid) to authenticated;
grant execute on function public.release_ai_generation(uuid) to authenticated;

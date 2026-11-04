-- Mission history is append-only and the RPC enforces auth.uid() ownership.
-- Authenticated callers need EXECUTE so owner-scoped research runs can be persisted.
grant execute on function public.record_mission_event(uuid, text, jsonb) to authenticated;

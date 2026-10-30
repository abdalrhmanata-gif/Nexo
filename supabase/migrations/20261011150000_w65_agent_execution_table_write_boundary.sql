-- W65: agent execution rows are an audit record, not a client-writable state machine.
-- All writes must go through the narrowly scoped SECURITY DEFINER RPCs.
revoke all privileges on table public.agent_executions
  from public, anon, authenticated;

grant select on table public.agent_executions to authenticated;

drop policy if exists agent_executions_editor_insert on public.agent_executions;
drop policy if exists agent_executions_editor_update on public.agent_executions;

-- W52 adds indexes for public foreign keys that were confirmed as
-- unindexed by the Supabase Development Performance Advisor.
-- The retry_of_execution_id FK is intentionally omitted: the existing
-- partial index covers non-null retry references without adding a duplicate.
create index if not exists agent_executions_action_id_idx
  on public.agent_executions (action_id);

create index if not exists agent_executions_approval_id_idx
  on public.agent_executions (approval_id);

create index if not exists agent_executions_requested_by_idx
  on public.agent_executions (requested_by);

create index if not exists mission_approvals_action_id_idx
  on public.mission_approvals (action_id);

create index if not exists mission_approvals_decided_by_idx
  on public.mission_approvals (decided_by);

create index if not exists mission_approvals_requested_by_idx
  on public.mission_approvals (requested_by);

create index if not exists workspace_activity_actor_user_id_idx
  on public.workspace_activity (actor_user_id);

create index if not exists workspace_agents_created_by_idx
  on public.workspace_agents (created_by);

create index if not exists workspace_invitations_invited_by_idx
  on public.workspace_invitations (invited_by);

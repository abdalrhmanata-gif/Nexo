-- W86: add leading indexes for the two unindexed foreign keys on authority budgets.
-- These support parent-row delete checks and joins on agent/user ownership.

create index if not exists mission_authority_budgets_agent_id_idx
  on public.mission_authority_budgets(agent_id);

create index if not exists mission_authority_budgets_created_by_idx
  on public.mission_authority_budgets(created_by);

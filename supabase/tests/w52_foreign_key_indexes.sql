-- W52: every FK flagged by Performance Advisor has an exact, valid,
-- non-partial single-column index. retry_of_execution_id is covered by an
-- existing partial index and is intentionally not duplicated here.
begin;
create extension if not exists pgtap;
select plan(9);

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'action_id'
  where ns.nspname = 'public' and tbl.relname = 'agent_executions'
    and ix.relname = 'agent_executions_action_id_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'action_id'
), 'agent_executions.action_id has a valid single-column index');

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'approval_id'
  where ns.nspname = 'public' and tbl.relname = 'agent_executions'
    and ix.relname = 'agent_executions_approval_id_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'approval_id'
), 'agent_executions.approval_id has a valid single-column index');

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'requested_by'
  where ns.nspname = 'public' and tbl.relname = 'agent_executions'
    and ix.relname = 'agent_executions_requested_by_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'requested_by'
), 'agent_executions.requested_by has a valid single-column index');

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'action_id'
  where ns.nspname = 'public' and tbl.relname = 'mission_approvals'
    and ix.relname = 'mission_approvals_action_id_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'action_id'
), 'mission_approvals.action_id has a valid single-column index');

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'decided_by'
  where ns.nspname = 'public' and tbl.relname = 'mission_approvals'
    and ix.relname = 'mission_approvals_decided_by_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'decided_by'
), 'mission_approvals.decided_by has a valid single-column index');

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'requested_by'
  where ns.nspname = 'public' and tbl.relname = 'mission_approvals'
    and ix.relname = 'mission_approvals_requested_by_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'requested_by'
), 'mission_approvals.requested_by has a valid single-column index');

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'actor_user_id'
  where ns.nspname = 'public' and tbl.relname = 'workspace_activity'
    and ix.relname = 'workspace_activity_actor_user_id_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'actor_user_id'
), 'workspace_activity.actor_user_id has a valid single-column index');

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'created_by'
  where ns.nspname = 'public' and tbl.relname = 'workspace_agents'
    and ix.relname = 'workspace_agents_created_by_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'created_by'
), 'workspace_agents.created_by has a valid single-column index');

select ok(exists(
  select 1 from pg_index i
  join pg_class ix on ix.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_attribute a on a.attrelid = tbl.oid and a.attname = 'invited_by'
  where ns.nspname = 'public' and tbl.relname = 'workspace_invitations'
    and ix.relname = 'workspace_invitations_invited_by_idx'
    and i.indisvalid and i.indisready and i.indpred is null
    and i.indnkeyatts = 1 and pg_get_indexdef(i.indexrelid, 1, true) = 'invited_by'
), 'workspace_invitations.invited_by has a valid single-column index');

select * from finish();
rollback;

-- W49: bounded agent execution recovery security contract.
begin;
create extension if not exists pgtap;
select plan(17);

select ok(to_regclass('public.agent_executions') is not null,
  'agent execution table exists');
select ok(has_column('public', 'agent_executions', 'heartbeat_at'),
  'execution heartbeat timestamp exists');
select ok(has_column('public', 'agent_executions', 'lease_expires_at'),
  'execution lease expiry exists');
select ok(has_column('public', 'agent_executions', 'cancel_requested_at'),
  'cancellation request timestamp exists');
select ok(has_column('public', 'agent_executions', 'retry_of_execution_id'),
  'retry lineage is stored');
select ok(has_column('public', 'agent_executions', 'attempt_number'),
  'attempt number is stored');
select ok(has_column('public', 'agent_executions', 'reconciled_at'),
  'reconciliation timestamp exists');
select ok(to_regclass('public.agent_executions_workspace_status_lease_idx') is not null,
  'stale execution scan has a supporting index');
select ok(not has_table_privilege('authenticated', 'public.agent_executions', 'INSERT'),
  'authenticated users cannot insert execution rows directly');
select ok(not has_table_privilege('authenticated', 'public.agent_executions', 'UPDATE'),
  'authenticated users cannot mutate execution state directly');
select ok(has_function_privilege('authenticated', 'public.heartbeat_agent_execution(uuid)', 'EXECUTE'),
  'authenticated workers can heartbeat executions');
select ok(has_function_privilege('authenticated', 'public.request_agent_execution_cancellation(uuid)', 'EXECUTE'),
  'authenticated editors can request cancellation');
select ok(has_function_privilege('authenticated', 'public.reconcile_stale_agent_execution(uuid)', 'EXECUTE'),
  'authenticated users can invoke reconciliation boundary');
select ok(has_function_privilege('authenticated', 'public.retry_agent_execution(uuid,text)', 'EXECUTE'),
  'authenticated editors can request safe retries');
select ok(not has_function_privilege('anon', 'public.retry_agent_execution(uuid,text)', 'EXECUTE'),
  'anonymous users cannot retry executions');
select ok(not exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('heartbeat_agent_execution', 'request_agent_execution_cancellation',
      'reconcile_stale_agent_execution', 'retry_agent_execution')
    and p.prosecdef
), 'public execution recovery wrappers remain SECURITY INVOKER');
select ok(not exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('heartbeat_agent_execution', 'request_agent_execution_cancellation',
      'reconcile_stale_agent_execution', 'retry_agent_execution')
    and p.prosecdef
    and coalesce(array_to_string(p.proconfig, '|'), '') not like '%search_path=pg_catalog, public%'
), 'private recovery functions are SECURITY DEFINER with pinned search_path');

select * from finish();
rollback;

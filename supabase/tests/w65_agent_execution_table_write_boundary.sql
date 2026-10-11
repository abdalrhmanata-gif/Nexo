-- W65: prevent direct client writes that bypass the execution state machine.
begin;
create extension if not exists pgtap;
select plan(10);

select ok(has_table_privilege('authenticated', 'public.agent_executions', 'SELECT'),
  'authenticated workspace members retain table-level read privilege subject to RLS');
select ok(not has_table_privilege('authenticated', 'public.agent_executions', 'INSERT'),
  'authenticated users cannot insert executions directly');
select ok(not has_table_privilege('authenticated', 'public.agent_executions', 'UPDATE'),
  'authenticated users cannot update execution status, result, evidence, or lease directly');
select ok(not has_table_privilege('authenticated', 'public.agent_executions', 'DELETE'),
  'authenticated users cannot delete execution audit records directly');
select ok(not has_table_privilege('authenticated', 'public.agent_executions', 'TRUNCATE'),
  'authenticated users cannot truncate execution audit records');
select ok(not has_table_privilege('anon', 'public.agent_executions', 'SELECT'),
  'anonymous users have no direct table access');
select ok(not exists (
  select 1 from pg_policies
   where schemaname = 'public'
     and tablename = 'agent_executions'
     and policyname = 'agent_executions_editor_insert'
), 'the old client insert policy is removed');
select ok(not exists (
  select 1 from pg_policies
   where schemaname = 'public'
     and tablename = 'agent_executions'
     and policyname = 'agent_executions_editor_update'
), 'the old client update policy is removed');
select ok(has_function_privilege('authenticated',
  'public.start_agent_execution(uuid,uuid,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated clients can still start executions through the guarded RPC');
select ok(not has_function_privilege('authenticated',
  'public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'generic completion remains trusted-worker-only');

select * from finish();
rollback;

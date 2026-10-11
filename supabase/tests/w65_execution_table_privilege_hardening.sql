-- W65: client roles cannot directly mutate or truncate agent execution history.
begin;
create extension if not exists pgtap;
select plan(15);

select ok(has_table_privilege('authenticated','public.agent_executions','SELECT'),
  'authenticated users retain table SELECT for RLS-protected history');
select ok(not has_table_privilege('anon','public.agent_executions','SELECT'),
  'anonymous users cannot read execution history');
select ok(not has_table_privilege('authenticated','public.agent_executions','INSERT'),
  'authenticated users cannot insert forged execution rows');
select ok(not has_table_privilege('authenticated','public.agent_executions','UPDATE'),
  'authenticated users cannot rewrite execution status or evidence');
select ok(not has_table_privilege('authenticated','public.agent_executions','DELETE'),
  'authenticated users cannot delete execution records');
select ok(not has_table_privilege('authenticated','public.agent_executions','TRUNCATE'),
  'authenticated users cannot truncate all execution history outside RLS');
select ok(not has_table_privilege('authenticated','public.agent_executions','REFERENCES'),
  'authenticated users cannot add foreign-key references to execution history');
select ok(not has_table_privilege('authenticated','public.agent_executions','TRIGGER'),
  'authenticated users cannot attach triggers to execution history');
select ok(not has_table_privilege('anon','public.agent_executions','INSERT')
  and not has_table_privilege('anon','public.agent_executions','UPDATE')
  and not has_table_privilege('anon','public.agent_executions','DELETE')
  and not has_table_privilege('anon','public.agent_executions','TRUNCATE'),
  'anonymous users have no direct write or truncate privileges');
select ok(has_table_privilege('service_role','public.agent_executions','SELECT')
  and has_table_privilege('service_role','public.agent_executions','INSERT')
  and has_table_privilege('service_role','public.agent_executions','UPDATE')
  and has_table_privilege('service_role','public.agent_executions','DELETE')
  and has_table_privilege('service_role','public.agent_executions','TRUNCATE'),
  'trusted service role retains the table privileges required by guarded server operations');
select ok(has_function_privilege('authenticated',
  'public.start_agent_execution(uuid,uuid,uuid,text,jsonb)','EXECUTE'),
  'authenticated users can still start executions through the guarded RPC');
select ok(has_function_privilege('authenticated',
  'public.retry_agent_execution(uuid,text)','EXECUTE'),
  'authenticated users can still request guarded retries');
select ok(not has_function_privilege('authenticated',
  'public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)','EXECUTE'),
  'generic completion remains trusted-worker-only');
select ok(has_function_privilege('authenticated',
  'public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)','EXECUTE'),
  'the narrow read-only research completion path remains available');
select ok(not has_function_privilege('anon',
  'public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)','EXECUTE'),
  'anonymous users cannot call the narrow research completion path');

select * from finish();
rollback;

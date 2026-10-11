-- W66: even service_role must use guarded RPCs to change execution state.
begin;
create extension if not exists pgtap;
select plan(11);

select ok(not has_table_privilege('service_role', 'public.agent_executions', 'SELECT'),
  'service_role cannot directly read the execution table');
select ok(not has_table_privilege('service_role', 'public.agent_executions', 'INSERT'),
  'service_role cannot directly insert execution rows');
select ok(not has_table_privilege('service_role', 'public.agent_executions', 'UPDATE'),
  'service_role cannot directly rewrite execution status, result or evidence');
select ok(not has_table_privilege('service_role', 'public.agent_executions', 'DELETE'),
  'service_role cannot directly delete execution history');
select ok(not has_table_privilege('service_role', 'public.agent_executions', 'TRUNCATE'),
  'service_role cannot truncate execution history outside the guarded boundary');
select ok(not has_table_privilege('service_role', 'public.agent_executions', 'REFERENCES'),
  'service_role cannot add direct foreign-key references to execution history');
select ok(not has_table_privilege('service_role', 'public.agent_executions', 'TRIGGER'),
  'service_role cannot attach direct triggers to execution history');
select ok(has_function_privilege('service_role',
  'public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'service_role retains only the intended trusted completion RPC');
select ok(has_function_privilege('service_role',
  'private.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'the guarded private completion implementation remains executable by the trusted worker');
select ok(has_table_privilege('authenticated', 'public.agent_executions', 'SELECT'),
  'authenticated workspace members retain RLS-protected history reads');
select ok(not has_function_privilege('authenticated',
  'public.complete_agent_execution(uuid,text,jsonb,jsonb,text,text)', 'EXECUTE'),
  'authenticated clients still cannot bypass trusted completion');

select * from finish();
rollback;

-- W56: regression contract for duplicate agent-execution dispatch guards.
-- This is a schema/function-definition test, not proof of provider-side reconciliation.
begin;
create extension if not exists pgtap;
select plan(12);

select ok(to_regclass('public.agent_executions') is not null,
  'agent execution ledger exists');
select ok(to_regprocedure('public.start_agent_execution(uuid,uuid,uuid,text,jsonb)') is not null,
  'public start-execution wrapper exists');
select ok(to_regprocedure('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)') is not null,
  'private start-execution implementation exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure),
  'public wrapper is SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid = 'private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure),
  'private implementation is SECURITY DEFINER');
select ok(coalesce(array_to_string((select proconfig from pg_proc where oid = 'private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure), '|'), '')
  like '%search_path=pg_catalog, public%',
  'private implementation pins search_path');
select ok(not has_function_privilege('anon', 'public.start_agent_execution(uuid,uuid,uuid,text,jsonb)', 'EXECUTE'),
  'anonymous users cannot start executions');
select ok(has_function_privilege('authenticated', 'public.start_agent_execution(uuid,uuid,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated callers use the audited wrapper');

select ok(
  lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))
    like '%raise exception ''execution_already_exists''%'
  and lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))
    like '%execution_idempotency_binding_mismatch%',
  'a reused key is rejected and a mismatched binding is not reused');

select ok(
  position('if found then' in lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure))) > 0
  and position(
    'raise exception ''execution_already_exists'''
    in split_part(
      split_part(lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)), 'if found then', 2),
      'v_requires_approval', 1
    )
  ) > 0
  and position(
    'return v_execution'
    in split_part(
      split_part(lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)), 'if found then', 2),
      'v_requires_approval', 1
    )
  ) = 0,
  'existing-execution branch fails closed instead of returning the old row as dispatch permission');

select ok(
  regexp_replace(
    lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)),
    '[[:space:]]+', '', 'g'
  ) like '%idempotency_key=p_idempotency_key%'
  and regexp_replace(
    lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)),
    '[[:space:]]+', '', 'g'
  ) like '%forupdate%'
  and regexp_replace(
    lower(pg_get_functiondef('private.start_agent_execution(uuid,uuid,uuid,text,jsonb)'::regprocedure)),
    '[[:space:]]+', '', 'g'
  ) like '%insertintopublic.agent_executions%',
  'start path checks existing key under a lock before inserting a new attempt');

select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.agent_executions'::regclass
    and contype = 'u'
    and lower(pg_get_constraintdef(oid)) like '%(workspace_id, idempotency_key)%'
), 'database enforces workspace-scoped idempotency uniqueness');

select * from finish();
rollback;

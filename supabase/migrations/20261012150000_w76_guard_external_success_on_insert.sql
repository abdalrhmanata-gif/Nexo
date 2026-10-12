-- W76: enforce the correlatable-receipt rule on both INSERT and UPDATE.
-- W65/W66 revoke direct writes from application roles, but the invariant must
-- also hold for any future trusted SECURITY DEFINER writer or internal path.
drop trigger if exists agent_execution_success_receipt_guard on public.agent_executions;

create trigger agent_execution_success_receipt_guard
before insert or update on public.agent_executions
for each row execute function private.guard_external_execution_success_receipt();

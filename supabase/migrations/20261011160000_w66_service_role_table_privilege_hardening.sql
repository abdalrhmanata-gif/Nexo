-- W66: service_role is trusted to call guarded RPCs, not to mutate the
-- execution ledger directly. Without this revoke, a leaked service key could
-- bypass W63 completion evidence validation and the W65 write boundary.
revoke all privileges on table public.agent_executions from service_role;

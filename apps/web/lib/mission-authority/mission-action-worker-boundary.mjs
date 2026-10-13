export async function runMissionActionWorker({ audience, operation, executionId, resolveAdapter, createClient, dispatch, reconcile }) {
  const adapter = resolveAdapter(audience);
  if (!adapter) return { kind: "missing_adapter" };
  if (operation === "reconcile" && typeof adapter.reconcile !== "function") return { kind: "missing_reconciliation" };
  if (operation !== "dispatch" && operation !== "reconcile") return { kind: "invalid_operation" };
  const client = createClient();
  const result = operation === "dispatch"
    ? await dispatch({ client, adapter, executionId })
    : await reconcile({ client, adapter, executionId });
  return { kind: "completed", result };
}
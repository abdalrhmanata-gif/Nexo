export async function runMissionActionWorker({ audience, operation, executionId, resolveAdapter, createClient, dispatch, reconcile }) {
  if (operation !== "dispatch" && operation !== "reconcile") return { kind: "invalid_operation" };

  const adapter = resolveAdapter(audience);
  if (!adapter || adapter.audience !== audience) return { kind: "missing_adapter" };
  // Validate the full trusted-adapter contract before creating a privileged client.
  if (typeof adapter.dispatch !== "function") return { kind: "missing_dispatch" };
  if (typeof adapter.reconcile !== "function") return { kind: "missing_reconciliation" };

  const client = createClient();
  const result = operation === "dispatch"
    ? await dispatch({ client, adapter, executionId })
    : await reconcile({ client, adapter, executionId });
  return { kind: "completed", result };
}
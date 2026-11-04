export type MissionActionWorkerOperation = "dispatch" | "reconcile";

export type MissionActionWorkerResult =
  | { kind: "missing_adapter" }
  | { kind: "missing_dispatch" }
  | { kind: "missing_reconciliation" }
  | { kind: "invalid_operation" }
  | { kind: "completed"; result: { decision: string; [key: string]: unknown } };

export function runMissionActionWorker<TClient, TAdapter, TResult extends { decision: string }>(args: {
  audience: string;
  operation: MissionActionWorkerOperation;
  executionId: string;
  resolveAdapter: (audience: string) => TAdapter | null;
  createClient: () => TClient;
  dispatch: (args: { client: TClient; adapter: TAdapter; executionId: string }) => Promise<TResult>;
  reconcile: (args: { client: TClient; adapter: TAdapter; executionId: string }) => Promise<TResult>;
}): Promise<
  | { kind: "missing_adapter" }
  | { kind: "missing_dispatch" }
  | { kind: "missing_reconciliation" }
  | { kind: "invalid_operation" }
  | { kind: "completed"; result: TResult }
>;

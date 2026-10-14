import type { TrustedProviderAdapter, TrustedRpcClient, PersistentDispatchResult } from "./persistent-dispatch-gateway.mjs";

export type TrustedWorkerRequestParseResult =
  | { ok: true; body: Record<string, unknown> }
  | {
      ok: false;
      status: 400 | 401 | 413 | 503;
      body: { error: string };
    };

export type TrustedWorkerOperationResponse = {
  status: number;
  body: Record<string, unknown>;
};

export function parseTrustedWorkerRequest(
  request: Request,
  expectedToken: string | undefined,
): Promise<TrustedWorkerRequestParseResult>;

export function createMissionActionWorkerOperationHandler<TClient extends TrustedRpcClient>(dependencies: {
  resolveAdapter: (audience: string) => TrustedProviderAdapter | null;
  createClient: () => TClient;
  dispatch: (input: {
    client: TClient;
    adapter: TrustedProviderAdapter;
    executionId: string;
  }) => Promise<PersistentDispatchResult>;
  reconcile: (input: {
    client: TClient;
    adapter: TrustedProviderAdapter;
    executionId: string;
  }) => Promise<PersistentDispatchResult>;
}): (input: {
  workerBody: Record<string, unknown>;
  executionId: string;
}) => Promise<TrustedWorkerOperationResponse>;

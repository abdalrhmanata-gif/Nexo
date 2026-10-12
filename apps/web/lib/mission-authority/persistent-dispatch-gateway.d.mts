export type PersistentDispatchDecision = "DENY" | "DISPATCHED" | "RECONCILE_REQUIRED" | "RECONCILED";

export interface PersistentDispatchResult {
  decision: PersistentDispatchDecision;
  executionId: string | null;
  reasonCode: string;
  dispatched?: boolean;
  providerLookupPerformed?: boolean;
  persisted: boolean;
  status: string | null;
  safeToRetry?: boolean;
  receipt?: Record<string, unknown>;
}

export interface TrustedProviderAdapter {
  audience: string;
  dispatch(claim: Readonly<Record<string, unknown>>): Promise<unknown>;
  reconcile?(claim: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export interface TrustedRpcClient {
  rpc: (...args: any[]) => any;
}

export const PERSISTENT_DISPATCH_DECISIONS: Readonly<{
  DENY: "DENY";
  DISPATCHED: "DISPATCHED";
  RECONCILE_REQUIRED: "RECONCILE_REQUIRED";
  RECONCILED: "RECONCILED";
}>;

export function dispatchThroughJitClaim(input: {
  client: TrustedRpcClient;
  adapter: TrustedProviderAdapter;
  executionId: string;
}): Promise<PersistentDispatchResult>;

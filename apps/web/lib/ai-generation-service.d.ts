export type AiGenerationOutcome =
  | {
      kind: "success";
      plan: unknown;
    }
  | {
      kind: "quota";
      reservation: unknown;
    }
  | {
      kind: "provider_error";
      disposition: "release" | "hold";
      status: number;
      code: string;
      reservationId?: string;
    }
  | {
      kind: "settlement_failed";
      reservationId: string;
    };

export declare const AI_GENERATION_OUTCOMES: {
  readonly SUCCESS: "success";
  readonly QUOTA: "quota";
  readonly PROVIDER_ERROR: "provider_error";
  readonly SETTLEMENT_FAILED: "settlement_failed";
};

export declare function classifyProviderFailure(error: unknown): {
  kind: "provider_error";
  disposition: "release" | "hold";
  status: number;
  code: string;
};

export declare function runAiGeneration(args: {
  requestId: string;
  reserve: (requestId: string) => Promise<{
    allowed: boolean;
    reservation_id: string | null;
    [key: string]: unknown;
  }>;
  generate: () => Promise<unknown>;
  consume: (reservationId: string) => Promise<void>;
  release: (reservationId: string) => Promise<void>;
}): Promise<AiGenerationOutcome>;

import type { MissionPlan } from "./ai-planner";

export type AiReservation = {
  allowed: boolean;
  reservation_id: string | null;
  plan?: string | null;
  monthly_limit?: number | null;
  generations_used?: number | null;
  remaining?: number | null;
  [key: string]: unknown;
};

export type AiGenerationOutcome =
  | {
      kind: "success";
      plan: MissionPlan;
    }
  | {
      kind: "quota";
      reservation: AiReservation;
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
  reserve: (requestId: string) => Promise<AiReservation>;
  generate: () => Promise<MissionPlan>;
  consume: (reservationId: string) => Promise<void>;
  release: (reservationId: string) => Promise<void>;
}): Promise<AiGenerationOutcome>;

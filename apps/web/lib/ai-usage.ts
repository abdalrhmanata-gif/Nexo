import { createSupabaseServerClient } from "./supabase/server";
import { createHash } from "node:crypto";

export type AiUsage = {
  period_start: string;
  plan: "free" | "plus" | "pro";
  monthly_limit: number;
  generations_used: number;
  remaining: number;
};

export async function getAiUsage(): Promise<AiUsage> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_ai_usage");
  if (error || !data?.[0]) throw new Error("AI_USAGE_UNAVAILABLE");
  return data[0] as AiUsage;
}

export type AiGenerationKind = "planner" | "research";

export async function reserveAiGeneration(requestId: string, generationKind: AiGenerationKind, input: unknown) {
  const supabase = await createSupabaseServerClient();
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const { data, error } = await supabase.rpc("reserve_ai_generation", {
    p_request_id: requestId,
    p_generation_kind: generationKind,
    p_request_hash: requestHash,
  });
  if (error || !data?.[0]) throw new Error("AI_USAGE_UNAVAILABLE");
  const reservation = data[0] as {
    allowed: boolean;
    reservation_id: string | null;
    period_start: string;
    plan: "free" | "plus" | "pro";
    monthly_limit: number;
    generations_used: number;
    remaining: number;
    reason: "duplicate_request" | "quota_exceeded" | null;
  };
  if (!reservation.allowed || typeof reservation.reservation_id !== "string") {
    return { ...reservation, allowed: false, reservation_id: null };
  }
  return reservation;
}

export async function consumeAiGeneration(reservationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_ai_generation", {
    p_reservation_id: reservationId,
  });
  if (error || data !== true) throw new Error("AI_USAGE_UNAVAILABLE");
}

export async function releaseAiGeneration(reservationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("release_ai_generation", {
    p_reservation_id: reservationId,
  });
  if (error || data !== true) throw new Error("AI_USAGE_UNAVAILABLE");
}

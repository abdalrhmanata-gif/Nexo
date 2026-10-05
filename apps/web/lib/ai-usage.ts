import { createSupabaseServerClient } from "./supabase/server";

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

export async function reserveAiGeneration(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reserve_ai_generation", {
    p_request_id: requestId,
  });
  if (error || !data?.[0]) throw new Error("AI_USAGE_UNAVAILABLE");
  return data[0] as {
    allowed: boolean;
    reservation_id: string | null;
    period_start: string;
    plan: "free" | "plus" | "pro";
    monthly_limit: number;
    generations_used: number;
    remaining: number;
  };
}

export async function consumeAiGeneration(reservationId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("consume_ai_generation", {
    p_reservation_id: reservationId,
  });
  if (error) throw new Error("AI_USAGE_UNAVAILABLE");
}

export async function releaseAiGeneration(reservationId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("release_ai_generation", {
    p_reservation_id: reservationId,
  });
}

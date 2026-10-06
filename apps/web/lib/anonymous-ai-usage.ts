import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./supabase/config";

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function reserveAnonymousAiGeneration(
  visitorHash: string,
  ipHash: string,
  requestId: string,
) {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc("reserve_anonymous_ai_generation", {
    p_visitor_hash: visitorHash,
    p_ip_hash: ipHash,
    p_request_id: requestId,
  });
  if (error || !data?.[0]) throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
  return data[0] as {
    allowed: boolean;
    reservation_id: string | null;
    remaining: number;
    reason: string | null;
  };
}

export async function consumeAnonymousAiGeneration(reservationId: string) {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc("consume_anonymous_ai_generation", {
    p_reservation_id: reservationId,
  });
  if (error || data !== true) throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
}

export async function releaseAnonymousAiGeneration(reservationId: string) {
  const supabase = getAdminClient();
  await supabase.rpc("release_anonymous_ai_generation", {
    p_reservation_id: reservationId,
  });
}

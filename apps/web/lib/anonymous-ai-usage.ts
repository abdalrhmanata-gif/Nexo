import { supabaseUrl } from "./supabase/config";

function getServerDbKey() {
  const key = process.env.ZAVQERA_SERVER_DB_KEY;
  if (!supabaseUrl || !key) throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
  return key;
}

async function callRpc<T>(name: string, body: Record<string, unknown>) {
  const key = getServerDbKey();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
  return await response.json() as T;
}

export async function reserveAnonymousAiGeneration(
  visitorHash: string,
  ipHash: string,
  requestId: string,
) {
  const data = await callRpc<Array<{
    allowed: boolean;
    reservation_id: string | null;
    remaining: number;
    reason: string | null;
  }>>("reserve_anonymous_ai_generation", {
    p_visitor_hash: visitorHash,
    p_ip_hash: ipHash,
    p_request_id: requestId,
  });
  if (!data?.[0]) throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
  return data[0];
}

export async function consumeAnonymousAiGeneration(reservationId: string) {
  const data = await callRpc<boolean>("consume_anonymous_ai_generation", {
    p_reservation_id: reservationId,
  });
  if (data !== true) throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
}

export async function releaseAnonymousAiGeneration(reservationId: string) {
  await callRpc<boolean>("release_anonymous_ai_generation", {
    p_reservation_id: reservationId,
  });
}

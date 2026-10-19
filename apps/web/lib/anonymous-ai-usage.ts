import { supabaseUrl } from "./supabase/config";

function getServerDbKey() {
  const key = process.env.ZAVQERA_SERVER_DB_KEY;
  if (!supabaseUrl || !key) throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
  return key;
}

function getServerDbHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  };

  // Current Supabase secret API keys are not JWTs and must be sent via apikey only.
  if (key.startsWith("sb_secret_")) return headers;

  // Older Supabase service_role keys are JWTs; PostgREST needs the bearer role
  // token as well as apikey for these legacy keys. Fail closed on other JWT roles.
  if (key.startsWith("eyJ")) {
    try {
      const segments = key.split(".");
      if (segments.length !== 3) throw new Error("invalid_jwt_shape");
      const claims = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as {
        role?: unknown;
      };
      if (claims.role !== "service_role") throw new Error("invalid_server_role");
    } catch {
      throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
    }
    headers.Authorization = `Bearer ${key}`;
    return headers;
  }

  throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
}

async function callRpc<T>(name: string, body: Record<string, unknown>) {
  const key = getServerDbKey();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: getServerDbHeaders(key),
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
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

/**
 * Build server-only headers for the anonymous AI quota RPC.
 * @param {string} key
 * @returns {Record<string, string>}
 */
export function getServerDbHeaders(key) {
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
  };

  // Current Supabase secret API keys are not JWTs and use apikey only.
  if (key.startsWith("sb_secret_")) return headers;

  // Legacy Supabase API keys are JWTs and also need the bearer header.
  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
    return headers;
  }

  throw new Error("ANONYMOUS_AI_GUARD_UNAVAILABLE");
}

// Who is behind an assistant's access token.
//
// Supabase Auth issues the token when the person approves the assistant on
// zavqera.com. It is checked with Supabase Auth on every request, at the
// endpoint Supabase provides for OAuth apps, GET /auth/v1/oauth/userinfo.
// That endpoint verifies the token, loads the person and the session behind
// it, and refuses a session that no longer exists, so a connection the
// person removed stops working at once.
//
// GET /auth/v1/user also accepts these tokens today, but Supabase marks that
// as temporary and plans to refuse OAuth app tokens there. It is used only
// when the userinfo endpoint does not exist on the server at all.

export const USERINFO_PATH = "/auth/v1/oauth/userinfo";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 8000;

export function userInfoUrl(supabaseUrl) {
  return `${String(supabaseUrl).replace(/\/+$/, "")}${USERINFO_PATH}`;
}

/**
 * What an answer from the userinfo endpoint means.
 * - user: the token is valid and belongs to `id`.
 * - rejected: the token is missing, expired, revoked or not from this
 *   project; the assistant should connect again.
 * - unsupported: the endpoint does not exist on this server.
 * - unavailable: Supabase Auth could not answer right now (rate limit,
 *   outage); the request should be tried again rather than reconnected.
 */
export function readUserInfo(status, body) {
  if (status === 200) {
    const sub = body && typeof body === "object" && typeof body.sub === "string" ? body.sub : "";
    return UUID.test(sub) ? { outcome: "user", id: sub.toLowerCase() } : { outcome: "rejected" };
  }
  if (status === 400 || status === 401 || status === 403) return { outcome: "rejected" };
  if (status === 404 || status === 405) return { outcome: "unsupported" };
  return { outcome: "unavailable" };
}

/**
 * The person behind `token`: `{ id }`, `null` when the token is not valid,
 * or "unavailable" when Supabase Auth could not be asked. `fallback` is
 * called only when the userinfo endpoint does not exist.
 */
export async function checkAccessToken({ supabaseUrl, apiKey, token, fallback, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  if (!token) return null;
  let response;
  try {
    response = await fetchImpl(userInfoUrl(supabaseUrl), {
      method: "GET",
      headers: { apikey: apiKey, Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return "unavailable";
  }

  let body = null;
  if (response.status === 200) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  const answer = readUserInfo(response.status, body);
  if (answer.outcome === "user") return { id: answer.id };
  if (answer.outcome === "rejected") return null;
  if (answer.outcome === "unsupported" && fallback) {
    try {
      return await fallback();
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}

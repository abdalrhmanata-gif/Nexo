// Which workspace the app is showing.
//
// Everyone owns one workspace. Accepting an invitation adds them to another.
// The choice between them is kept in a cookie, and the cookie is only a
// preference: the mission repository checks membership before using it, and
// row level security decides what any query can reach.

export const WORKSPACE_COOKIE = "zavqera-workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The cookie's value for a workspace id, or null if it is not a UUID. */
export function workspaceCookieValue(value) {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return UUID.test(id) ? id : null;
}

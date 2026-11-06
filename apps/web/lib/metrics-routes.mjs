// The set of pages worth counting, and nothing else.
//
// Normalising here rather than storing whatever a caller sends is what keeps
// the table bounded: a mission id in the path would otherwise create a new row
// per mission per day, and an untrusted caller could invent rows at will.
// Anything unrecognised is counted as "other", so the totals still add up.

export const COUNTED_ROUTES = [
  "/",
  "/pricing",
  "/templates",
  "/privacy",
  "/terms",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/app",
  "/app/business",
  "/app/opportunities",
  "/app/notifications",
  "/app/missions/new",
];

/** A mission detail page is one page, however many missions exist. */
const MISSION_DETAIL = "/app/missions/[id]";

export function normaliseRoute(pathname) {
  const path = String(pathname ?? "").split("?")[0].split("#")[0];
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (COUNTED_ROUTES.includes(trimmed)) return trimmed;
  if (/^\/app\/missions\/[^/]+$/.test(trimmed)) return MISSION_DETAIL;
  return "other";
}

/** The site that linked here, reduced to a host. Never a full URL with a query. */
export function normaliseReferrer(referrer, selfHost) {
  if (!referrer) return "direct";
  let host;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (!host) return "direct";
  if (selfHost && host === String(selfHost).toLowerCase()) return "internal";
  return host.length > 100 ? "direct" : host;
}

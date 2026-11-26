// The set of pages worth counting, and nothing else.
//
// Normalising here rather than storing whatever a caller sends is what keeps
// the table bounded: a mission id in the path would otherwise create a new row
// per mission per day, and an untrusted caller could invent rows at will.
// Anything unrecognised is counted as "other", so the totals still add up.

// The pages search engines send people to were missing from this list, so
// every guide and template view was dropped as "other" and the counter could
// not say whether the guides brought anyone. They are listed by name, like
// everything else here: a slug a caller invents is still "other".
// test/goal-plan.test.mjs keeps these two lists equal to the real ones.
export const GUIDE_SLUGS = [
  "how-to-start-a-business",
  "how-to-start-an-llc",
  "how-to-get-an-ein",
  "how-to-write-a-business-plan",
  "how-to-open-a-business-bank-account",
  "moving-to-germany-checklist",
  "moving-to-the-uk-checklist",
];
export const TEMPLATE_IDS = [
  "business-opportunity-scan",
  "launch-plan",
  "research-decision",
  "weekly-operations",
  "settle-new-country",
  "find-a-job",
  "organise-an-event",
];
// test/checklists.test.mjs keeps this list equal to lib/checklists.mjs.
export const CHECKLIST_SLUGS = [
  "employee-onboarding-checklist",
  "employee-offboarding-checklist",
  "client-onboarding-checklist",
  "month-end-close-checklist",
  "project-handoff-checklist",
  "website-launch-checklist",
  "vendor-onboarding-checklist",
  "move-in-move-out-inspection-checklist",
  "quarterly-access-review-checklist",
];
// test/checklists-ar.test.mjs keeps this list equal to lib/checklists-ar.mjs.
export const CHECKLIST_SLUGS_AR = ["employee-clearance-checklist", "rental-unit-handover-checklist"];
const GUIDE_PREFIXES = ["", "/es", "/ar", "/fr", "/de", "/nb"];

export const COUNTED_ROUTES = [
  "/",
  "/try",
  "/pricing",
  "/templates",
  ...TEMPLATE_IDS.map((id) => `/templates/${id}`),
  ...GUIDE_PREFIXES.flatMap((prefix) => [`${prefix}/guides`, ...GUIDE_SLUGS.map((slug) => `${prefix}/guides/${slug}`)]),
  "/checklists",
  ...CHECKLIST_SLUGS.map((slug) => `/checklists/${slug}`),
  "/ar/checklists",
  ...CHECKLIST_SLUGS_AR.map((slug) => `/ar/checklists/${slug}`),
  "/ar/employee-task-tracker",
  "/compare/zavqera-vs-chatgpt-claude-gemini",
  "/privacy",
  "/terms",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/app",
  "/app/start",
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

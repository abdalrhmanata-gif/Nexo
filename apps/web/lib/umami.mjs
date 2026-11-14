import { COUNTED_ROUTES, normaliseRoute } from "./metrics-routes.mjs";

// Umami Cloud: a second, external view of traffic on the public pages.
//
// The script comes from another company, so this module — not the script —
// decides what reaches it. The script's automatic tracking is switched off in
// components/umami-analytics.tsx; the only thing ever sent is a page view
// built by umamiPageview() below, and that function refuses anything that is
// not a known public page on the production site.
//
// The website id is not a secret: it is printed in the HTML of every page
// that loads the script, and it only says which Umami site a view belongs to.

export const UMAMI_SCRIPT_URL = "https://cloud.umami.is/script.js";
export const UMAMI_WEBSITE_ID = "a40d074d-53d8-4ce1-8996-1365abf4009e";
/** The hostnames that report. A preview build or a local run is neither. */
export const UMAMI_DOMAINS = ["zavqera.com", "www.zavqera.com"];

/**
 * The pages our own counter knows, minus everything behind the sign-in. A
 * workspace address can carry a mission id, and the workspace is where a
 * person's own work lives; none of that is a third party's business.
 */
const PUBLIC_ROUTES = COUNTED_ROUTES.filter((route) => route !== "/app" && !route.startsWith("/app/"));

export function isUmamiHost(hostname) {
  return typeof hostname === "string" && UMAMI_DOMAINS.includes(hostname.toLowerCase());
}

/**
 * The address to report for a pathname: the bare path of a known public page,
 * or null when nothing should be reported. The query string and the fragment
 * are dropped — sign-in links carry tokens there.
 */
export function umamiPageFor(pathname) {
  if (typeof pathname !== "string" || !pathname) return null;
  const route = normaliseRoute(pathname);
  return PUBLIC_ROUTES.includes(route) ? route : null;
}

/**
 * The site that linked here, reduced to its origin. Our own pages are
 * reported as no referrer at all, so arriving from inside the workspace never
 * hands over a workspace address.
 */
export function umamiReferrerFor(referrer, selfHost) {
  if (typeof referrer !== "string" || !referrer) return "";
  let url;
  try {
    url = new URL(referrer);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  const host = url.hostname.toLowerCase();
  if (!host || isUmamiHost(host) || host === String(selfHost ?? "").toLowerCase()) return "";
  return `${url.protocol}//${url.host}`;
}

/**
 * The one page view we are willing to send, or null. `base` is the payload
 * the Umami script prepared (site id, screen size, language, page title);
 * the address and the referrer in it are replaced with ours.
 */
export function umamiPageview(base, { pathname, referrer, hostname }) {
  if (!isUmamiHost(hostname)) return null;
  const url = umamiPageFor(pathname);
  if (!url) return null;
  return { ...base, url, referrer: umamiReferrerFor(referrer, hostname) };
}

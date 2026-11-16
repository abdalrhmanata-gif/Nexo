/**
 * Require browser requests to originate from this exact application origin.
 * If Origin is absent, only allow an explicit Fetch Metadata same-origin signal.
 *
 * Netlify runs the app behind a proxy, and `request.url` can then carry the
 * deploy's permalink host rather than the host the browser is on (the same
 * fact resolveRequestOrigin in lib/auth/redirect.mjs exists for). Comparing
 * Origin with `request.url` alone refused the page's own requests whenever
 * that happened. So when the two differ, the public host from the forwarded
 * headers is accepted too, but only when the browser itself says the request
 * is same-origin: Sec-Fetch-Site cannot be set by a page's script, and a
 * page on another site cannot send a forwarded-host header of its choosing.
 */
function publicOrigins(request) {
  let protocol = "https:";
  try {
    protocol = new URL(request.url).protocol;
  } catch {
    protocol = "https:";
  }
  const proto = (request.headers.get("x-forwarded-proto") || protocol.replace(":", "")).split(",")[0].trim();
  const origins = [];
  for (const name of ["x-forwarded-host", "host"]) {
    const host = (request.headers.get(name) || "").split(",")[0].trim();
    if (!host) continue;
    try {
      origins.push(new URL(`${proto}://${host}`).origin);
    } catch {
      // Not a host; ignore it.
    }
  }
  return origins;
}

export function isTrustedSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (origin) {
    let claimed;
    try {
      claimed = new URL(origin).origin;
      if (claimed === new URL(request.url).origin) return true;
    } catch {
      return false;
    }
    if (fetchSite !== "same-origin") return false;
    return publicOrigins(request).includes(claimed);
  }

  return fetchSite === "same-origin";
}

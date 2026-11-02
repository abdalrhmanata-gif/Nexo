const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Trust only browser requests from this exact application origin.
 * Next may construct an internal request URL behind a proxy, so also compare
 * against the public Host and forwarded protocol when those headers exist.
 * If Origin is absent, require Fetch Metadata to explicitly say same-origin.
 */
export function isTrustedSameOriginRequest(request) {
  const origin = request.headers.get("origin");

  if (origin) {
    let suppliedOrigin;
    try {
      suppliedOrigin = new URL(origin).origin;
    } catch {
      return false;
    }

    const requestUrl = new URL(request.url);
    if (suppliedOrigin === requestUrl.origin) return true;

    const host = request.headers.get("host");
    if (!host) return false;

    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProtocol && /^(https?)$/i.test(forwardedProtocol)
      ? forwardedProtocol.toLowerCase()
      : requestUrl.protocol.slice(0, -1);

    try {
      return suppliedOrigin === new URL(`${protocol}://${host}`).origin;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * Cookie-authenticated API mutations must be same-origin. The internal worker
 * endpoint has its own server-to-server authentication and is intentionally
 * excluded; read-only API requests do not need this CSRF boundary.
 */
export function shouldEnforceSameOriginForApiRequest(request) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/")) return false;
  if (pathname === "/api/internal" || pathname.startsWith("/api/internal/")) return false;
  return MUTATING_METHODS.has(request.method.toUpperCase());
}

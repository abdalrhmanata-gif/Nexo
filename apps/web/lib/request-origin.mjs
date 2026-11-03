const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Trust only browser requests from this exact application origin.
 * Next may construct an internal request URL behind a proxy. When Host is
 * present, it is the public authority to validate; a matching internal URL
 * must never bypass a conflicting Host / forwarded-protocol pair.
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
    const host = request.headers.get("host");
    const forwardedProtocolHeader = request.headers.get("x-forwarded-proto");
    let protocol = requestUrl.protocol.slice(0, -1);

    if (forwardedProtocolHeader) {
      const forwardedProtocol = forwardedProtocolHeader.split(",")[0]?.trim();
      if (!forwardedProtocol || !/^(https?)$/i.test(forwardedProtocol)) return false;
      protocol = forwardedProtocol.toLowerCase();
    }

    try {
      const expectedOrigin = host
        ? new URL(`${protocol}://${host}`).origin
        : requestUrl.origin;
      return suppliedOrigin === expectedOrigin;
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

/**
 * Require browser requests to originate from this exact application origin.
 * If Origin is absent, only allow an explicit Fetch Metadata same-origin signal.
 */
export function isTrustedSameOriginRequest(request) {
  const origin = request.headers.get("origin");

  if (origin) {
    try {
      return new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}

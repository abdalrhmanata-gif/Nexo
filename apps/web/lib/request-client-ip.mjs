import { isIP } from "node:net";

function parseIp(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

/**
 * Derives an address for abuse-rate-limit bucketing.
 *
 * Netlify's platform-managed X-Nf-Client-Connection-Ip header is the primary
 * source. When it is absent (for local development or another trusted proxy),
 * select the right-most valid X-Forwarded-For address rather than the
 * left-most value, which is commonly client-supplied and spoofable.
 */
export function getRequestClientIp(request) {
  const headers = request.headers;
  const platformIp = parseIp(headers.get("x-nf-client-connection-ip") ?? "");
  if (platformIp) return platformIp;

  const forwarded = headers.get("x-forwarded-for") ?? "";
  const forwardedCandidates = forwarded
    .split(",")
    .map(parseIp)
    .filter((ip) => ip !== null);
  if (forwardedCandidates.length > 0) {
    return forwardedCandidates[forwardedCandidates.length - 1];
  }

  return parseIp(headers.get("x-real-ip") ?? "") ?? "unknown";
}

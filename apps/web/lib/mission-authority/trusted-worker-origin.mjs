const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function parseOrigin(value, nodeEnv, loopbackOnly = false, requireRootPath = true) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || (requireRootPath && url.pathname !== "/" && url.pathname !== "")) {
    return null;
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (loopbackOnly && !loopback) return null;
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && nodeEnv !== "production" && loopback) return url.origin;
  return null;
}

/**
 * Determine where internal worker requests may send their bearer token.
 * Local tests may use only loopback. Deployed targets must come from trusted
 * environment variables and use HTTPS; request URLs are never trusted in production.
 */
export function resolveTrustedWorkerOrigin({
  nodeEnv = "development",
  e2eRuntimeBaseUrl,
  deployPrimeUrl,
  deployUrl,
  siteUrl,
  publicSiteUrl,
  requestUrl,
} = {}) {
  if (nodeEnv !== "production") {
    const e2eOrigin = parseOrigin(e2eRuntimeBaseUrl, nodeEnv, true);
    if (e2eOrigin) return e2eOrigin;

    const requestOrigin = parseOrigin(requestUrl, nodeEnv, true, false);
    if (requestOrigin) return requestOrigin;
  }

  for (const candidate of [deployPrimeUrl, deployUrl, siteUrl, publicSiteUrl]) {
    const origin = parseOrigin(candidate, nodeEnv);
    if (origin) return origin;
  }
  return null;
}

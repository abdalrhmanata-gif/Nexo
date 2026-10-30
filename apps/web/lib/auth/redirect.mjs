export const DEFAULT_POST_AUTH_PATH = "/app";

/**
 * Email confirmation links carry a caller-supplied destination. Only same-origin
 * relative paths are accepted so a crafted link cannot turn the confirmation
 * endpoints into an open redirect.
 */
export function safeNextPath(value) {
  if (typeof value !== "string") return DEFAULT_POST_AUTH_PATH;
  if (!value.startsWith("/")) return DEFAULT_POST_AUTH_PATH;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_POST_AUTH_PATH;
  return value;
}

export function authErrorPath(reason) {
  return `/auth/sign-in?error=${encodeURIComponent(reason)}`;
}

/**
 * Netlify serves a branch deploy behind a proxy, so `request.url` carries the
 * deploy permalink host rather than the host the browser is on. Redirecting to
 * that permalink would move the user to a different origin and discard the
 * session cookie just written by the confirmation exchange, so the public host
 * from the forwarded headers wins.
 */
export function resolveRequestOrigin(headers, fallbackUrl) {
  const host = headers.get("x-forwarded-host") || headers.get("host");
  if (!host) return new URL(fallbackUrl).origin;
  const proto = headers.get("x-forwarded-proto") || new URL(fallbackUrl).protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Use Netlify's preview permalink for auth callbacks in Deploy Previews.
 * A configured public site URL may point to production and must not pull a
 * preview password-reset flow onto another origin.
 */
export function getAuthCallbackConfiguredSiteUrl({
  context,
  pullRequest,
  deployPrimeUrl,
  publicSiteUrl,
} = {}) {
  const isDeployPreview = String(context ?? "").trim().toLowerCase() === "deploy-preview"
    || String(pullRequest ?? "").trim().toLowerCase() === "true";
  const preferred = isDeployPreview ? deployPrimeUrl : publicSiteUrl;
  return typeof preferred === "string" ? preferred.trim() : "";
}

/**
 * Prefer an explicitly configured public origin for email callbacks. This
 * prevents an untrusted Host / forwarded-host header from choosing the
 * destination after an authentication token has been exchanged.
 */
export function resolveAuthCallbackOrigin(configuredSiteUrl, headers, fallbackUrl) {
  if (typeof configuredSiteUrl === "string" && configuredSiteUrl.trim()) {
    try {
      const parsed = new URL(configuredSiteUrl);
      if (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return parsed.origin;
      }
    } catch {
      // Fall through to the request origin when the optional value is invalid.
    }
  }
  return resolveRequestOrigin(headers, fallbackUrl);
}

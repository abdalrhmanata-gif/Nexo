// The pure part of the consent page: which authorization requests to accept
// at all, and what to tell the person about where they will be sent.

/** Supabase Auth's authorization ids: opaque, URL-safe, bounded. */
export function isAuthorizationId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{8,200}$/.test(value);
}

/**
 * The host the person returns to after answering, shown on the consent
 * screen as the MCP authorization spec requires, and whether it is their own
 * computer (a loopback address, as Claude Code uses), which deserves a
 * warning: any program on the computer could claim such an address.
 */
export function redirectTarget(uri) {
  try {
    const url = new URL(uri);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    return { host: url.host, loopback };
  } catch {
    return { host: "", loopback: false };
  }
}

/** A client's self-chosen name, made safe to show as one short line; null when it gave none. */
export function clientLabel(name) {
  const text = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 80) : null;
}

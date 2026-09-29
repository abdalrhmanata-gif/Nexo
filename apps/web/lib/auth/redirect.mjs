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

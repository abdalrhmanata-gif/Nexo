import { createHash } from "node:crypto";
import type { AppLanguage } from "./i18n";
import { readStartRequest, startQuery, type StartRequest } from "./start-plan";

// "Save this plan" before an account exists has to survive a sign-up, an
// email confirmation (sometimes opened on another device) or a Google
// sign-in, and then save the plan without a second press. What carries it is
// one cookie, set only by our own server: by the Save button's action, or by
// the confirmation routes once they have signed the person in. It holds a
// fingerprint of the plan request, never its text, so the page that saves
// can tell "this is the plan you asked to save" from a link someone else
// crafted, which only ever gets a preview and a button.

export const START_COOKIE = "zavqera-start";
/** One day: long enough to find the confirmation email, short enough to forget. */
export const START_COOKIE_MAX_AGE = 60 * 60 * 24;

export function startToken(request: StartRequest) {
  return createHash("sha256").update(startQuery(request)).digest("base64url").slice(0, 32);
}

/** The token for a destination like "/app/start?goal=…&lang=en", or null. */
export function startTokenForPath(path: string, fallbackLanguage: AppLanguage = "en") {
  if (!path.startsWith("/app/start?")) return null;
  const url = new URL(path, "https://zavqera.invalid");
  const request = readStartRequest(Object.fromEntries(url.searchParams), fallbackLanguage);
  return request ? startToken(request) : null;
}

export const startCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: START_COOKIE_MAX_AGE,
};

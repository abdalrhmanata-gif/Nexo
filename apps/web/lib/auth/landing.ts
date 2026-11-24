import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DEFAULT_POST_AUTH_PATH, safeNextPath } from "./redirect.mjs";
import { START_COOKIE, startCookieOptions, startTokenForPath } from "../start-plan-token";

/**
 * Where a person goes once a confirmation link or a Google sign-in has just
 * signed them in.
 *
 * The confirmation email is a Supabase template that always sends people to
 * /app, so the place they were heading when they signed up (a plan they
 * pressed "Save" on) would be lost there. Sign-up therefore records that
 * place on the account as `pending_next`; it is used here, once, when the
 * link itself names only the default, and then cleared. It is still checked
 * like any other destination: a relative path on this site, nothing else.
 */
/** The one call this needs from a Supabase client, so any client version fits. */
type CanUpdateUser = { auth: { updateUser(attributes: { data: Record<string, unknown> }): Promise<unknown> } };

export async function landingAfterSignIn(supabase: CanUpdateUser, user: User | null | undefined, next: string) {
  let path = next;
  const pending = user?.user_metadata?.pending_next;
  if (typeof pending === "string" && pending) {
    if (next === DEFAULT_POST_AUTH_PATH) path = safeNextPath(pending);
    try {
      await supabase.auth.updateUser({ data: { pending_next: null } });
    } catch {
      // Clearing is tidiness, not safety: the value is only ever a path here.
    }
  }
  return path;
}

/**
 * The redirect to that place. When it is the page that saves a plan, the
 * response also carries the cookie that lets that page save it without a
 * second press: the person asked for it before signing up.
 */
export function redirectToLanding(path: string, origin: string) {
  const response = NextResponse.redirect(new URL(path, origin));
  const token = startTokenForPath(path);
  if (token) response.cookies.set(START_COOKIE, token, startCookieOptions);
  return response;
}

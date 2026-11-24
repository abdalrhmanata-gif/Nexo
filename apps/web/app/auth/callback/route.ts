import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { authErrorPath, resolveRequestOrigin, safeNextPath } from "../../../lib/auth/redirect.mjs";
import { landingAfterSignIn, redirectToLanding } from "../../../lib/auth/landing";

export const dynamic = "force-dynamic";

/**
 * PKCE exchange endpoint. Supabase email confirmation links resolve through
 * /auth/v1/verify and land here with a one-time `code` that must be exchanged
 * for a cookie-backed session before the user is considered confirmed.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const origin = resolveRequestOrigin(request.headers, request.url);
  // Google sign-in returns here too, marked so its failures (a cancelled
  // consent screen, most often) are not reported as a broken email link.
  const failure = searchParams.get("via") === "google" ? "google" : "confirmation-link";
  // A cancelled Google sign-in keeps the destination, so trying again (or
  // switching to email) still saves the plan the person was saving.
  const failurePath = failure === "google" && next !== "/app"
    ? `${authErrorPath(failure)}&next=${encodeURIComponent(next)}`
    : authErrorPath(failure);

  if (searchParams.get("error")) {
    return NextResponse.redirect(new URL(failurePath, origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL(authErrorPath("missing-code"), origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(failurePath, origin));
  }

  // A password reset goes to the password form whatever was pending.
  if (next === "/auth/reset-password") return NextResponse.redirect(new URL(next, origin));
  return redirectToLanding(await landingAfterSignIn(supabase, data.user, next), origin);
}

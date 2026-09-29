import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { authErrorPath, safeNextPath } from "../../../lib/auth/redirect.mjs";

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

  if (searchParams.get("error")) {
    return NextResponse.redirect(new URL(authErrorPath("confirmation-link"), request.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL(authErrorPath("missing-code"), request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(authErrorPath("confirmation-link"), request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}

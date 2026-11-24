import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { authErrorPath, resolveRequestOrigin, safeNextPath } from "../../../lib/auth/redirect.mjs";
import { landingAfterSignIn, redirectToLanding } from "../../../lib/auth/landing";

export const dynamic = "force-dynamic";

/**
 * Token-hash confirmation endpoint for email templates built on
 * {{ .TokenHash }} instead of the default {{ .ConfirmationURL }}.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));
  const origin = resolveRequestOrigin(request.headers, request.url);

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL(authErrorPath("missing-token"), origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // A reset link that no longer works belongs on the reset page, which
    // explains it and offers a new one. The sign-in page's message is about
    // confirmation links and tells the person to sign up again.
    if (type === "recovery") {
      return NextResponse.redirect(new URL("/auth/reset-password?error_code=otp_expired", origin));
    }
    return NextResponse.redirect(new URL(authErrorPath("confirmation-link"), origin));
  }

  // A recovery link goes to the password form whatever was pending.
  if (type === "recovery") return NextResponse.redirect(new URL(next, origin));
  return redirectToLanding(await landingAfterSignIn(supabase, data.user, next), origin);
}

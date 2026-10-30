import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { authErrorPath, getAuthCallbackConfiguredSiteUrl, resolveAuthCallbackOrigin, safeNextPath } from "../../../lib/auth/redirect.mjs";

export const dynamic = "force-dynamic";

/**
 * PKCE exchange endpoint. Supabase email confirmation links resolve through
 * /auth/v1/verify and land here with a one-time `code` that must be exchanged
 * for a cookie-backed session before the user is considered confirmed.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));
  const configuredSiteUrl = getAuthCallbackConfiguredSiteUrl({
    context: process.env.CONTEXT,
    pullRequest: process.env.PULL_REQUEST,
    deployPrimeUrl: process.env.DEPLOY_PRIME_URL,
    publicSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
  const origin = resolveAuthCallbackOrigin(configuredSiteUrl, request.headers, request.url);

  if (searchParams.get("error")) {
    return NextResponse.redirect(new URL(authErrorPath("auth-error"), origin));
  }
  if (!code && !(tokenHash && otpType)) {
    return NextResponse.redirect(new URL(authErrorPath("missing-code"), origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType! });
  if (error) {
    return NextResponse.redirect(new URL(authErrorPath("confirmation-link"), origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}

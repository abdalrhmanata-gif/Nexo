import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { authErrorPath, resolveRequestOrigin, safeNextPath } from "../../../lib/auth/redirect.mjs";

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
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(new URL(authErrorPath("confirmation-link"), origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}

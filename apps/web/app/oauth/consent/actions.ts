"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isAuthorizationId } from "../../../lib/mcp/consent.mjs";
import { decide } from "../../../lib/mcp/oauth-server";

/**
 * The person's answer to an assistant asking to use their account. Supabase
 * Auth records it and returns the address to send them back to: the
 * assistant's own callback, carrying an authorization code (allowed) or an
 * access_denied error (denied). Redirects happen outside the try, so a
 * catch never swallows them.
 */
export async function decideAuthorization(formData: FormData) {
  const id = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!isAuthorizationId(id)) redirect("/oauth/consent?status=invalid");

  let target: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const result = await decide(supabase, id, approve);
    if (!result.error && result.data?.redirect_url) target = result.data.redirect_url;
  } catch {
    target = null;
  }
  redirect(target ?? `/oauth/consent?authorization_id=${encodeURIComponent(id)}&status=failed`);
}

"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { revokeGrant } from "../../../lib/mcp/oauth-server";

const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Removes an assistant's access: Supabase Auth marks the consent revoked,
 * ends the assistant's sessions and invalidates its refresh tokens, so its
 * next request to /mcp is refused.
 */
export async function removeConnection(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  let status = "failed";
  if (CLIENT_ID.test(clientId)) {
    try {
      const supabase = await createSupabaseServerClient();
      const result = await revokeGrant(supabase, clientId);
      if (!result.error) status = "removed";
    } catch {
      status = "failed";
    }
  }
  redirect(`/app/connections?status=${status}`);
}

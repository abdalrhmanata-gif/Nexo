import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { isTrustedSameOriginRequest } from "../../../../../lib/request-origin.mjs";
import { workspaceCookieValue } from "../../../../../lib/team-workspace.mjs";

export const dynamic = "force-dynamic";

/** Revoke an invitation that has not been accepted. The database checks the role. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedSameOriginRequest(request)) return NextResponse.json({ error: "The invitation could not be revoked." }, { status: 403 });
  const id = workspaceCookieValue((await params).id);
  if (!id) return NextResponse.json({ error: "The invitation could not be revoked." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const revoked = await supabase.rpc("revoke_workspace_invitation", { p_invitation_id: id });
  if (revoked.error) return NextResponse.json({ error: "The invitation could not be revoked." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

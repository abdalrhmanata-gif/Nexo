import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { isTrustedSameOriginRequest } from "../../../../../lib/request-origin.mjs";
import { acceptErrorMessage, hashInvitationToken } from "../../../../../lib/team-invitations.mjs";
import { WORKSPACE_COOKIE, workspaceCookieValue } from "../../../../../lib/team-workspace.mjs";

export const dynamic = "force-dynamic";

/** Accept an invitation and open the workspace it leads to. */
export async function POST(request: NextRequest) {
  if (!isTrustedSameOriginRequest(request)) {
    return NextResponse.json({ error: acceptErrorMessage(undefined) }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const tokenHash = hashInvitationToken(body.token);
  if (!tokenHash) return NextResponse.json({ error: acceptErrorMessage("INVITATION_NOT_FOUND") }, { status: 400 });

  const accepted = await supabase.rpc("accept_workspace_invitation", { p_token_hash: tokenHash });
  if (accepted.error) {
    return NextResponse.json({ error: acceptErrorMessage(accepted.error.message) }, { status: 400 });
  }
  const workspaceId = workspaceCookieValue((accepted.data as { workspace_id?: unknown } | null)?.workspace_id);
  const response = NextResponse.json({ accepted: true });
  if (workspaceId) {
    response.cookies.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

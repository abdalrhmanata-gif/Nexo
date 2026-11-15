import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { isTrustedSameOriginRequest } from "../../../../lib/request-origin.mjs";
import { resolveRequestOrigin } from "../../../../lib/auth/redirect.mjs";
import { sendInvitationEmail } from "../../../../lib/team-email";
import {
  INVITE_ROLES,
  MAX_PENDING_INVITATIONS,
  inviteErrorMessage,
  invitationExpiry,
  invitationLink,
  newInvitationToken,
  normaliseInviteEmail,
} from "../../../../lib/team-invitations.mjs";

export const dynamic = "force-dynamic";

/**
 * Invite someone into the signed-in person's own workspace. The database
 * decides who may invite and refuses duplicates; this route makes the token,
 * keeps only its hash, and sends the email. When the email cannot be sent the
 * link comes back so the inviter can pass it on themselves.
 */
export async function POST(request: NextRequest) {
  if (!isTrustedSameOriginRequest(request)) {
    return NextResponse.json({ error: "The invitation could not be created. Try again." }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = normaliseInviteEmail(body.email);
  const role = typeof body.role === "string" && (INVITE_ROLES as readonly string[]).includes(body.role) ? body.role : null;
  if (!email) return NextResponse.json({ error: inviteErrorMessage("INVALID_INVITATION_EMAIL") }, { status: 400 });
  if (!role) return NextResponse.json({ error: inviteErrorMessage(undefined) }, { status: 400 });
  if (email === user.email.toLowerCase()) return NextResponse.json({ error: inviteErrorMessage("USER_ALREADY_MEMBER") }, { status: 400 });

  const workspace = await supabase.rpc("ensure_owned_workspace");
  if (workspace.error || typeof workspace.data !== "string") {
    return NextResponse.json({ error: inviteErrorMessage(undefined) }, { status: 500 });
  }
  const workspaceId = workspace.data;

  const pending = await supabase.from("workspace_invitations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "PENDING")
    .gt("expires_at", new Date().toISOString());
  if (pending.error) return NextResponse.json({ error: inviteErrorMessage(undefined) }, { status: 500 });
  if ((pending.count ?? 0) >= MAX_PENDING_INVITATIONS) {
    return NextResponse.json({ error: inviteErrorMessage("PENDING_LIMIT") }, { status: 429 });
  }

  const { token, tokenHash } = newInvitationToken();
  const created = await supabase.rpc("create_workspace_invitation", {
    p_workspace_id: workspaceId,
    p_email: email,
    p_role: role,
    p_token_hash: tokenHash,
    p_expires_at: invitationExpiry(),
  });
  if (created.error) {
    return NextResponse.json({ error: inviteErrorMessage(created.error.message) }, { status: 400 });
  }

  const link = invitationLink(resolveRequestOrigin(request.headers, request.url), token);
  const emailed = await sendInvitationEmail({ to: email, inviterEmail: user.email, link, role, idempotencyKey: tokenHash });
  return NextResponse.json(emailed ? { emailed: true } : { emailed: false, link }, { status: 201 });
}

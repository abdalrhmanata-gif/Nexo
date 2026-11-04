import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../../lib/supabase/config";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Invitations are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const { token } = await params;
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
      return NextResponse.json({ error: "Invalid invitation token." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // This public RPC deliberately exposes only invitation metadata when the
    // caller proves possession of the high-entropy token. It does not accept
    // the invitation or grant workspace access.
    const supabase = await createSupabaseServerClient();
    const result = await supabase.rpc("get_workspace_invitation", { p_token_hash: hashToken(token) });
    if (result.error) {
      return NextResponse.json({ error: "The invitation could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      invitation: {
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      },
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "The invitation could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: "Invitations are unavailable." }, { status: 503 });
    const { token } = await params;
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Sign in with the invited email before accepting this invitation." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const repository = await createSupabaseMissionRepository().catch(() => null);
    if (!repository?.acceptWorkspaceInvitation) return NextResponse.json({ error: "Invitations are temporarily unavailable." }, { status: 503 });
    try {
      const invitation = await repository.acceptWorkspaceInvitation(hashToken(token));
      return NextResponse.json({ invitation }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const status = message.includes("AUTHENTICATION_REQUIRED") ? 401
        : message.includes("INVITATION_EMAIL_MISMATCH") || message.includes("WORKSPACE_ADMIN_REQUIRED") ? 403
        : 400;
      return NextResponse.json({ error: message.includes("INVITATION_EMAIL_MISMATCH")
        ? "Sign in with the email address that received this invitation."
        : message.includes("INVITATION_EXPIRED")
          ? "This invitation has expired."
          : message.includes("INVITATION_NOT_PENDING")
            ? "This invitation is no longer pending."
            : message.includes("USER_ALREADY_MEMBER")
              ? "You are already a member of this workspace."
              : "The invitation could not be accepted." }, { status, headers: { "Cache-Control": "no-store" } });
    }
  } catch {
    return NextResponse.json({ error: "The invitation could not be accepted." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

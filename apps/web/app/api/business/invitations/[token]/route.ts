import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../../../lib/supabase/config";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: "Invitations are unavailable." }, { status: 503 });
    const { token } = await params;
    if (!token || token.length < 32) return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });
    const repository = await createSupabaseMissionRepository().catch(() => null);
    if (!repository?.getWorkspaceInvitation) return NextResponse.json({ error: "Invitations are unavailable." }, { status: 503 });
    const invitation = await repository.getWorkspaceInvitation(hashToken(token));
    if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    return NextResponse.json({ invitation });
  } catch {
    return NextResponse.json({ error: "The invitation could not be loaded." }, { status: 400 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: "Invitations are unavailable." }, { status: 503 });
    const { token } = await params;
    if (!token || token.length < 32) return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });
    const repository = await createSupabaseMissionRepository().catch(() => null);
    if (!repository?.acceptWorkspaceInvitation) return NextResponse.json({ error: "Invitations are unavailable." }, { status: 503 });
    try {
      const invitation = await repository.acceptWorkspaceInvitation(hashToken(token));
      return NextResponse.json({ invitation });
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
            : "The invitation could not be accepted." }, { status });
    }
  } catch {
    return NextResponse.json({ error: "The invitation could not be accepted." }, { status: 400 });
  }
}

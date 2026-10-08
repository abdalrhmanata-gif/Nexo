import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";

const ROLES = ["admin", "member", "viewer"] as const;
type InvitationRole = (typeof ROLES)[number];

function isRole(value: unknown): value is InvitationRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Workspace invitations require the connected workspace backend." }, { status: 503 });
    }

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = isRole(body.role) ? body.role : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) {
      return NextResponse.json({ error: "Provide a valid email address and role." }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

    const repository = await createSupabaseMissionRepository();
    if (!repository.createWorkspaceInvitation) {
      return NextResponse.json({ error: "Workspace invitations are not available." }, { status: 503 });
    }

    try {
      const invitation = await repository.createWorkspaceInvitation({
        email,
        role,
        tokenHash,
        expiresAt,
      });

      return NextResponse.json({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        },
        inviteToken: token,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const known = message.includes("INVITATION_ALREADY_PENDING")
        ? "An invitation is already pending for this email."
        : message.includes("USER_ALREADY_MEMBER")
          ? "This user is already a workspace member."
          : message.includes("WORKSPACE_ADMIN_REQUIRED")
            ? "Only a workspace owner or admin can invite teammates."
            : "The invitation could not be created.";
      return NextResponse.json({ error: known }, { status: message.includes("WORKSPACE_ADMIN_REQUIRED") ? 403 : 400 });
    }
  } catch {
    return NextResponse.json({ error: "The invitation request could not be processed." }, { status: 400 });
  }
}

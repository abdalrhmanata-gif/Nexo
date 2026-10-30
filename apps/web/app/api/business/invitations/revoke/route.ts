import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../../../lib/supabase/config";

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: "Invitations are unavailable." }, { status: 503 });
    const body = await request.json();
    const invitationId = typeof body.invitationId === "string" ? body.invitationId : "";
    if (!invitationId) return NextResponse.json({ error: "Invitation id is required." }, { status: 400 });
    const repository = await createSupabaseMissionRepository();
    if (!repository.revokeWorkspaceInvitation) return NextResponse.json({ error: "Invitations are unavailable." }, { status: 503 });
    try {
      const invitation = await repository.revokeWorkspaceInvitation(invitationId);
      return NextResponse.json({ invitation });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return NextResponse.json({
        error: message.includes("WORKSPACE_ADMIN_REQUIRED")
          ? "Only a workspace owner or admin can revoke invitations."
          : message.includes("INVITATION_NOT_PENDING")
            ? "This invitation is no longer pending."
            : "The invitation could not be revoked.",
      }, { status: message.includes("WORKSPACE_ADMIN_REQUIRED") ? 403 : 400 });
    }
  } catch {
    return NextResponse.json({ error: "The invitation could not be revoked." }, { status: 400 });
  }
}

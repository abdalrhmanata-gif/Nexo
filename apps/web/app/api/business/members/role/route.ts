import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../../../lib/supabase/config";

const ROLES = ["owner", "admin", "member", "viewer"] as const;
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: "Member management is unavailable." }, { status: 503 });
    const body = await request.json();
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const role = typeof body.role === "string" && ROLES.includes(body.role as typeof ROLES[number]) ? body.role as typeof ROLES[number] : null;
    if (!memberId || !role) return NextResponse.json({ error: "Member and role are required." }, { status: 400 });
    const repository = await createSupabaseMissionRepository();
    if (!repository.updateWorkspaceMemberRole) return NextResponse.json({ error: "Member management is unavailable." }, { status: 503 });
    try {
      const member = await repository.updateWorkspaceMemberRole(memberId, role);
      return NextResponse.json({ member });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const map: Record<string,string> = {
        OWNER_PROTECTED: "The workspace owner is protected.",
        OWNER_ESCALATION_FORBIDDEN: "Only the workspace owner can assign the owner role.",
        SELF_OWNER_ESCALATION_FORBIDDEN: "You cannot promote yourself to owner.",
        PRIVILEGED_MEMBER_PROTECTED: "This privileged member can only be changed by the workspace owner.",
        WORKSPACE_ACCESS_REQUIRED: "You do not have access to manage this workspace.",
      };
      return NextResponse.json({ error: map[message] || "The member role could not be changed." }, { status: message.includes("REQUIRED") || message.includes("FORBIDDEN") ? 403 : 400 });
    }
  } catch {
    return NextResponse.json({ error: "The member role could not be changed." }, { status: 400 });
  }
}

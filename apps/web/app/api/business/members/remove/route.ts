import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../../../lib/supabase/config";

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: "Member management is unavailable." }, { status: 503 });
    const body = await request.json();
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    if (!memberId) return NextResponse.json({ error: "Member is required." }, { status: 400 });
    const repository = await createSupabaseMissionRepository();
    if (!repository.removeWorkspaceMember) return NextResponse.json({ error: "Member management is unavailable." }, { status: 503 });
    try {
      await repository.removeWorkspaceMember(memberId);
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const map: Record<string,string> = {
        OWNER_PROTECTED: "The workspace owner is protected.",
        WORKSPACE_OWNER_PROTECTED: "The workspace owner cannot be removed.",
        LAST_OWNER_PROTECTED: "The last workspace owner cannot be removed.",
        PRIVILEGED_MEMBER_PROTECTED: "Only the workspace owner can remove this privileged member.",
        WORKSPACE_ACCESS_REQUIRED: "You do not have access to manage this workspace.",
      };
      return NextResponse.json({ error: map[message] || "The member could not be removed." }, { status: message.includes("REQUIRED") || message.includes("PROTECTED") ? 403 : 400 });
    }
  } catch {
    return NextResponse.json({ error: "The member could not be removed." }, { status: 400 });
  }
}

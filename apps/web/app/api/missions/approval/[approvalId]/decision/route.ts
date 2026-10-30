import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid decision request is required." }, { status: 400 });
  }

  const decision = body.decision;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (decision !== "APPROVED" && decision !== "REJECTED" && decision !== "CANCELLED") {
    return NextResponse.json({ error: "Invalid approval decision." }, { status: 400 });
  }
  if (note.length > 4000) {
    return NextResponse.json({ error: "Decision notes must be 4,000 characters or fewer." }, { status: 400 });
  }
  if (decision === "REJECTED" && !note) {
    return NextResponse.json({ error: "A reason is required when rejecting an approval request." }, { status: 400 });
  }

  try {
    const { approvalId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const result = await supabase.rpc("decide_mission_approval", {
      p_approval_id: approvalId,
      p_decision: decision,
      p_note: note || null,
    });
    if (result.error) {
      if (result.error.message?.includes("APPROVAL_EXPIRED")) {
        return NextResponse.json({ error: "This approval request expired. Return to the mission and request a new scoped approval." }, { status: 409 });
      }
      if (result.error.message?.includes("APPROVAL_ALREADY_DECIDED")) {
        return NextResponse.json({ error: "This request has already been decided. Refresh the queue." }, { status: 409 });
      }
      return NextResponse.json({
        error: "The decision could not be recorded. Check your workspace role and refresh the queue.",
      }, { status: result.error.code === "42501" ? 403 : 400 });
    }
    return NextResponse.json({ approval: result.data });
  } catch {
    return NextResponse.json({ error: "The approval service could not complete this request." }, { status: 500 });
  }
}

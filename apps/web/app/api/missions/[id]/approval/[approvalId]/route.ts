import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DECISION_NOTE = 4000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; approvalId: string }> },
) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "A valid decision request is required." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid decision request is required." }, { status: 400 });
  }

  const decision = body.decision;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (decision !== "APPROVED" && decision !== "REJECTED" && decision !== "CANCELLED") {
    return NextResponse.json({ error: "Invalid approval decision." }, { status: 400 });
  }
  if (note.length > MAX_DECISION_NOTE) {
    return NextResponse.json({ error: "Decision notes must be 4,000 characters or fewer." }, { status: 400 });
  }
  if (decision === "REJECTED" && !note) {
    return NextResponse.json({ error: "A reason is required when rejecting an approval request." }, { status: 400 });
  }

  try {
    const { id, approvalId } = await params;
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(approvalId)) {
      return NextResponse.json({ error: "A valid mission and approval are required." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // The nested route must bind the approval to the mission named in its URL.
    // RLS still governs visibility; the decision RPC independently checks role and state.
    const scope = await supabase
      .from("mission_approvals")
      .select("id")
      .eq("id", approvalId)
      .eq("mission_id", id)
      .maybeSingle();
    if (scope.error) {
      return NextResponse.json({ error: "The approval scope could not be confirmed." }, { status: 503 });
    }
    if (!scope.data) {
      return NextResponse.json({ error: "Approval not found for this mission." }, { status: 404 });
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

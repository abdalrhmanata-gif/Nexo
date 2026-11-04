import { NextResponse, type NextRequest } from "next/server";
import { MissionMutationRejectedError } from "../../../../../lib/mission-repository";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const status = body.status;
    const confidence = body.confidence;
    if (status !== "VERIFIED" && status !== "FAILED") return NextResponse.json({ error: "Verification status must be VERIFIED or FAILED." }, { status: 400 });
    if (!objectValue(body.criteria) || !objectValue(body.evidence)) return NextResponse.json({ error: "Criteria and evidence must be JSON objects." }, { status: 400 });
    if (confidence !== undefined && confidence !== null && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) return NextResponse.json({ error: "Confidence must be between 0 and 1." }, { status: 400 });
    const repository = await createSupabaseMissionRepository();
    const verification = await repository.recordVerification!({
      missionId: id,
      status,
      criteria: body.criteria,
      evidence: body.evidence,
      confidence: confidence as number | null | undefined,
      failureReason: typeof body.failureReason === "string" ? body.failureReason : null,
    });
    return NextResponse.json(verification, { status: 201 });
  } catch (error) {
    if (error instanceof MissionMutationRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    // Anything left is an authorization or storage failure. The raw database
    // label is never echoed back, because it is neither useful nor safe.
    return NextResponse.json({ error: "That verification could not be recorded." }, { status: 403 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { MissionMutationRejectedError } from "../../../../../lib/mission-repository";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { validateMissionEvidencePayload } from "../../../../../lib/evidence-ledger.mjs";

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as unknown;
    if (!objectValue(body)) return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    const status = body.status;
    const confidence = body.confidence;
    if (status !== "VERIFIED" && status !== "FAILED") return NextResponse.json({ error: "Verification status must be VERIFIED or FAILED." }, { status: 400 });
    if (!objectValue(body.criteria) || typeof body.criteria.summary !== "string" || body.criteria.summary.trim().length < 12 || body.criteria.summary.length > 2000) {
      return NextResponse.json({ error: "Add verification criteria between 12 and 2,000 characters." }, { status: 400 });
    }
    if (confidence !== undefined && confidence !== null && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      return NextResponse.json({ error: "Confidence must be between 0 and 1." }, { status: 400 });
    }
    const evidence = validateMissionEvidencePayload(body.evidence);
    if (!evidence.valid) return NextResponse.json({ error: evidence.error }, { status: 400 });

    const repository = await createSupabaseMissionRepository();
    const verification = await repository.recordVerification!({
      missionId: id,
      status,
      criteria: { summary: body.criteria.summary.trim() },
      evidence: evidence.value,
      confidence: confidence as number | null | undefined,
      failureReason: typeof body.failureReason === "string" ? body.failureReason.slice(0, 1200) : null,
    });
    return NextResponse.json(verification, { status: 201 });
  } catch (error) {
    if (error instanceof MissionMutationRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "That verification could not be recorded." }, { status: 403 });
  }
}

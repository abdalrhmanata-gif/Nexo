import { NextResponse, type NextRequest } from "next/server";
import { MissionMutationRejectedError } from "../../../../../lib/mission-repository";
import { readBoundedJsonBody } from "../../../../../lib/read-bounded-json-body.mjs";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = await readBoundedJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: { "Cache-Control": "no-store" } });
    if (!objectValue(parsed.value)) return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const body = parsed.value;
    const status = body.status;
    const confidence = body.confidence;
    if (status !== "VERIFIED" && status !== "FAILED") return NextResponse.json({ error: "Verification status must be VERIFIED or FAILED." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    if (!objectValue(body.criteria) || !objectValue(body.evidence)) return NextResponse.json({ error: "Criteria and evidence must be JSON objects." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    if (confidence !== undefined && confidence !== null && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) return NextResponse.json({ error: "Confidence must be between 0 and 1." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const repository = await createSupabaseMissionRepository();
    const verification = await repository.recordVerification!({
      missionId: id,
      status,
      criteria: body.criteria,
      evidence: body.evidence,
      confidence: confidence as number | null | undefined,
      failureReason: typeof body.failureReason === "string" ? body.failureReason : null,
    });
    return NextResponse.json(verification, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MissionMutationRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "That verification could not be recorded." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}

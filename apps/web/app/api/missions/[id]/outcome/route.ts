import { NextResponse, type NextRequest } from "next/server";
import { MissionMutationRejectedError } from "../../../../../lib/mission-repository";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { validateMissionOutcomeDecision } from "../../../../../lib/evidence-ledger.mjs";

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as unknown;
    if (!objectValue(body)) return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    if (typeof body.verificationId !== "string" || !body.verificationId.trim()) {
      return NextResponse.json({ error: "The exact verification id is required." }, { status: 400 });
    }
    if (body.status !== undefined && body.status !== "COMPLETED" && body.status !== "FAILED") {
      return NextResponse.json({ error: "Outcome status is invalid." }, { status: 400 });
    }
    const decision = validateMissionOutcomeDecision(body.result, body.status);
    if (!decision.valid) return NextResponse.json({ error: decision.error }, { status: 400 });
    const score = body.successScore ?? (decision.status === "FAILED" ? 0 : 1);
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
      return NextResponse.json({ error: "Success score must be between 0 and 1." }, { status: 400 });
    }
    const repository = await createSupabaseMissionRepository();
    const outcome = await repository.commitOutcome!({
      missionId: id,
      verificationId: body.verificationId.trim(),
      result: decision.value,
      successScore: decision.status === "FAILED" ? 0 : score,
      status: decision.status,
    });
    return NextResponse.json(outcome, { status: 200 });
  } catch (error) {
    if (error instanceof MissionMutationRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "That outcome could not be committed." }, { status: 403 });
  }
}

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
    if (typeof body.verificationId !== "string" || !body.verificationId) return NextResponse.json({ error: "The exact verification id is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    if (!objectValue(body.result)) return NextResponse.json({ error: "Outcome result must be a JSON object." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const score = body.successScore ?? 1;
    if (typeof score !== "number" || score < 0 || score > 1) return NextResponse.json({ error: "Success score must be between 0 and 1." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    if (body.status !== undefined && body.status !== "COMPLETED" && body.status !== "FAILED") return NextResponse.json({ error: "Outcome status is invalid." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const repository = await createSupabaseMissionRepository();
    const outcome = await repository.commitOutcome!({
      missionId: id,
      verificationId: body.verificationId,
      result: body.result,
      successScore: score,
      status: body.status as "COMPLETED" | "FAILED" | undefined,
    });
    return NextResponse.json(outcome, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MissionMutationRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "That outcome could not be committed." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}

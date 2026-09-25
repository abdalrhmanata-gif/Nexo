import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.verificationId !== "string" || !body.verificationId) return NextResponse.json({ error: "The exact verification id is required." }, { status: 400 });
    if (!objectValue(body.result)) return NextResponse.json({ error: "Outcome result must be a JSON object." }, { status: 400 });
    const score = body.successScore ?? 1;
    if (typeof score !== "number" || score < 0 || score > 1) return NextResponse.json({ error: "Success score must be between 0 and 1." }, { status: 400 });
    if (body.status !== undefined && body.status !== "COMPLETED" && body.status !== "FAILED") return NextResponse.json({ error: "Outcome status is invalid." }, { status: 400 });
    const repository = await createSupabaseMissionRepository();
    const outcome = await repository.commitOutcome!({
      missionId: id,
      verificationId: body.verificationId,
      result: body.result,
      successScore: score,
      status: body.status as "COMPLETED" | "FAILED" | undefined,
    });
    return NextResponse.json(outcome, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outcome could not be committed.";
    const status = message.includes("Authentication required") ? 401 : message.includes("not owned") || message.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}

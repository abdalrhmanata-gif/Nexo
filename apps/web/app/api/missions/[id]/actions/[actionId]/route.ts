import { NextResponse, type NextRequest } from "next/server";
import { MissionMutationConflictError } from "../../../../../../lib/mission-repository";
import { createSupabaseMissionRepository } from "../../../../../../lib/supabase/mission-repository";
import type { ActionStatus } from "../../../../../../lib/view-models";

const statuses = new Set<ActionStatus>(["PENDING", "RUNNING", "COMPLETED", "BLOCKED", "CANCELLED"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> },
) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) {
      return NextResponse.json({ error: "expectedVersion must be a positive integer." }, { status: 400 });
    }
    if (typeof body.status !== "string" || !statuses.has(body.status as ActionStatus)) {
      return NextResponse.json({ error: "Invalid action state." }, { status: 400 });
    }
    const { id, actionId } = await params;
    const repository = await createSupabaseMissionRepository();
    const mission = await repository.getMission(id);
    if (!mission || !mission.actions.some((action) => action.id === actionId)) {
      return NextResponse.json({ error: "Action not found." }, { status: 404 });
    }
    const action = await repository.updateAction!({
      actionId,
      status: body.status,
      expectedVersion: body.expectedVersion,
    });
    return NextResponse.json({ action });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
    if (error instanceof MissionMutationConflictError) {
      return NextResponse.json({ error: "Action changed elsewhere. Refresh and retry.", code: "STALE_VERSION" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Action mutation was not accepted." }, { status: 403 });
  }
}

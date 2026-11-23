import { NextResponse, type NextRequest } from "next/server";
import { MissionMutationConflictError, MissionMutationRejectedError } from "../../../../../../lib/mission-repository";
import { createSupabaseMissionRepository } from "../../../../../../lib/supabase/mission-repository";
import type { ActionStatus } from "../../../../../../lib/view-models";
import { normaliseProof } from "../../../../../../lib/step-proof.mjs";
import { isTerminalMissionStatus } from "../../../../../../lib/mission-content.mjs";

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
    const setFollowUp = Object.prototype.hasOwnProperty.call(body, "followUpAt");
    let followUpAt: string | null = null;
    if (setFollowUp) {
      if (body.followUpAt !== null) {
        if (typeof body.followUpAt !== "string") {
          return NextResponse.json({ error: "followUpAt must be an ISO timestamp or null." }, { status: 400 });
        }
        const parsed = new Date(body.followUpAt);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "followUpAt must be a valid date." }, { status: 400 });
        }
        followUpAt = parsed.toISOString();
      }
    }
    const { id, actionId } = await params;
    const repository = await createSupabaseMissionRepository();
    const mission = await repository.getMission(id);
    if (!mission || !mission.actions.some((action) => action.id === actionId)) {
      return NextResponse.json({ error: "Action not found." }, { status: 404 });
    }
    if (body.status === "COMPLETED") {
      // Done is one step from any open state, with optional proof.
      if (setFollowUp) return NextResponse.json({ error: "A follow-up date can only be set while an action is Waiting." }, { status: 400 });
      const proof = normaliseProof({ note: body.evidenceNote, url: body.evidenceUrl });
      if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: 400 });
      const action = await repository.completeAction!({
        actionId,
        expectedVersion: body.expectedVersion,
        evidenceNote: proof.note,
        evidenceUrl: proof.url,
      });
      return NextResponse.json({ action });
    }
    const action = await repository.updateAction!({
      actionId,
      missionId: id,
      status: body.status,
      expectedVersion: body.expectedVersion,
      ...(setFollowUp ? { setFollowUp: true, followUpAt } : {}),
    });
    return NextResponse.json({ action });
  } catch (error) {
    return mutationFailure(error);
  }
}

/** Adds or changes the proof on a step that is already done. */
export async function PUT(
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
    const proof = normaliseProof({ note: body.evidenceNote, url: body.evidenceUrl });
    if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: 400 });
    const { id, actionId } = await params;
    const repository = await createSupabaseMissionRepository();
    const mission = await repository.getMission(id);
    if (!mission || !mission.actions.some((action) => action.id === actionId)) {
      return NextResponse.json({ error: "Action not found." }, { status: 404 });
    }
    // Once the outcome is recorded the steps are part of that record.
    if (isTerminalMissionStatus(mission.lifecycleStatus)) {
      return NextResponse.json({ error: "This mission is closed, so the proof on its steps can no longer change." }, { status: 422 });
    }
    const action = await repository.setActionProof!({
      actionId,
      expectedVersion: body.expectedVersion,
      evidenceNote: proof.note,
      evidenceUrl: proof.url,
    });
    return NextResponse.json({ action });
  } catch (error) {
    return mutationFailure(error);
  }
}

function mutationFailure(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  if (error instanceof MissionMutationConflictError) {
    return NextResponse.json({ error: "Action changed elsewhere. Refresh and retry.", code: "STALE_VERSION" }, { status: 409 });
  }
  if (error instanceof MissionMutationRejectedError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof Error && error.message === "Authentication required.") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json({ error: "Action mutation was not accepted." }, { status: 403 });
}

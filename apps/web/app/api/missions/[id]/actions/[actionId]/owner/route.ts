import { after, NextResponse, type NextRequest } from "next/server";
import { readStepOwners, setStepOwner, StepOwnerError } from "../../../../../../../lib/supabase/step-owner-repository";
import { sendStepOwnerEmail } from "../../../../../../../lib/team-email";
import { shouldEmailStepOwner, stepOwnerIdempotencyKey, stepOwnerLink } from "../../../../../../../lib/step-owner-email.mjs";
import { parseMissionObjective } from "../../../../../../../lib/mission-content.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Names who owns an open step, or clears it with assigneeId null. The
 * database checks everything: that the caller can edit the workspace, that
 * the person named can too, that the step is still open and that the version
 * is current.
 */
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
    if (body.assigneeId !== null && (typeof body.assigneeId !== "string" || !UUID.test(body.assigneeId))) {
      return NextResponse.json({ error: "assigneeId must be a user id or null." }, { status: 400 });
    }
    const { id, actionId } = await params;
    if (!UUID.test(actionId)) return NextResponse.json({ error: "Action not found." }, { status: 404 });
    const action = await setStepOwner({ actionId, expectedVersion: body.expectedVersion, assigneeId: body.assigneeId });
    // Tell the new owner, after the answer has gone back: the picker does
    // not wait for an email. Only someone else, and only what the database
    // accepted: the address comes from the workspace's editors.
    if (shouldEmailStepOwner({ assigneeId: action.assigneeId, actorId: action.actorId })) {
      const missionId = action.missionId || id;
      const origin = request.nextUrl.origin;
      after(async () => {
        const access = await readStepOwners(missionId);
        const assignee = access?.editors.find((editor) => editor.id === action.assigneeId);
        if (!access || !assignee?.email) return;
        await sendStepOwnerEmail({
          to: assignee.email,
          assignerEmail: action.actorEmail,
          stepTitle: action.title,
          missionName: parseMissionObjective(access.missionObjective).name,
          link: stepOwnerLink(origin, missionId),
          idempotencyKey: stepOwnerIdempotencyKey(action.id, assignee.id),
        });
      });
    }
    return NextResponse.json({ action: { id: action.id, version: action.version, assigneeId: action.assigneeId } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
    if (error instanceof StepOwnerError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The owner could not be saved. Try again." }, { status: 500 });
  }
}

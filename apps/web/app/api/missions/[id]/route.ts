import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { MissionMutationConflictError } from "../../../../lib/mission-repository";
import type { MissionLifecycleStatus } from "../../../../lib/view-models";

const statuses = new Set<MissionLifecycleStatus>([
  "DRAFT", "PLANNING", "READY", "RUNNING", "WAITING", "NEEDS_USER",
  "VERIFYING", "COMPLETED", "PAUSED", "BLOCKED", "FAILED", "CANCELLED",
]);

function errorResponse(error: unknown) {
  if (error instanceof MissionMutationConflictError) {
    return NextResponse.json({ error: "Mission changed elsewhere. Refresh and retry.", code: "STALE_VERSION" }, { status: 409 });
  }
  if (error instanceof Error && error.message === "Authentication required.") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json({ error: "Mission mutation was not accepted." }, { status: 403 });
}

function isProvenanceDeleteError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "23503"
    && "message" in error
    && typeof error.message === "string"
    && error.message.includes("mission_events");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const repository = await createSupabaseMissionRepository();
    await repository.deleteMission?.(id);
    return NextResponse.redirect(new URL("/app", request.url), 303);
  } catch (error) {
    if (isProvenanceDeleteError(error)) {
      return NextResponse.redirect(new URL("/app?error=mission-provenance", request.url), 303);
    }
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Mission could not be deleted." }, { status: 403 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const form = await request.formData();
  if (form.get("_method") !== "DELETE") {
    return NextResponse.json({ error: "Unsupported method" }, { status: 405 });
  }
  return DELETE(request, context);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }
    const expectedVersion = body.expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json({ error: "expectedVersion must be a positive integer." }, { status: 400 });
    }
    const hasObjective = Object.prototype.hasOwnProperty.call(body, "objective");
    const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
    if (hasObjective === hasStatus) {
      return NextResponse.json({ error: "Provide exactly one mission mutation." }, { status: 400 });
    }
    if (hasObjective && (typeof body.objective !== "string" || body.objective.trim().length < 1 || body.objective.trim().length > 10000)) {
      return NextResponse.json({ error: "objective must be 1 to 10000 characters." }, { status: 400 });
    }
    if (hasStatus && (typeof body.status !== "string" || !statuses.has(body.status as MissionLifecycleStatus))) {
      return NextResponse.json({ error: "Invalid mission state." }, { status: 400 });
    }
    const repository = await createSupabaseMissionRepository();
    const mission = await repository.updateMission!((await params).id, hasObjective
      ? { objective: body.objective.trim(), expectedVersion }
      : { status: body.status, expectedVersion });
    return NextResponse.json({ mission });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
    }
    return errorResponse(error);
  }
}

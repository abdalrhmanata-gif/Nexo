import { NextResponse, type NextRequest } from "next/server";
import { MissionMutationRejectedError } from "../../../../../lib/mission-repository";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";

const MAX_TITLE = 200;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Describe the work this action covers." }, { status: 400 });
    }
    if (title.length > MAX_TITLE) {
      return NextResponse.json({ error: `Keep the action under ${MAX_TITLE} characters.` }, { status: 400 });
    }
    const { id } = await params;
    const repository = await createSupabaseMissionRepository();
    const action = await repository.addAction!({ missionId: id, title });
    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
    if (error instanceof MissionMutationRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "That action could not be added." }, { status: 403 });
  }
}

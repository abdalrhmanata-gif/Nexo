import { NextResponse, type NextRequest } from "next/server";
import { MissionMutationConflictError, MissionMutationRejectedError } from "../../../../../lib/mission-repository";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { composeMissionObjective, mergeCriteria } from "../../../../../lib/mission-content.mjs";

const MAX_TITLE = 200;
const MAX_STEPS = 20;
const MAX_CRITERION = 300;
const MAX_CRITERIA = 10;

/**
 * Adds one step ({ title }) or a whole plan ({ titles, criteria }). A plan's
 * success criteria are merged into the mission's own, so "Add these steps"
 * records what finished looks like along with the work.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }
    const { id } = await params;

    if (Array.isArray(body.titles)) {
      const titles = body.titles.map((value: unknown) => typeof value === "string" ? value.trim() : "").filter(Boolean);
      if (!titles.length) return NextResponse.json({ error: "Describe the work this action covers." }, { status: 400 });
      if (titles.length > MAX_STEPS) return NextResponse.json({ error: `Add at most ${MAX_STEPS} steps at once.` }, { status: 400 });
      if (titles.some((title: string) => title.length > MAX_TITLE)) {
        return NextResponse.json({ error: `Keep the action under ${MAX_TITLE} characters.` }, { status: 400 });
      }
      const incoming = Array.isArray(body.criteria)
        ? body.criteria
          .filter((value: unknown): value is string => typeof value === "string")
          .map((value: string) => value.trim().slice(0, MAX_CRITERION))
          .filter(Boolean)
          .slice(0, MAX_CRITERIA)
        : [];

      const repository = await createSupabaseMissionRepository();
      const actions = await repository.addActions!({ missionId: id, titles });

      // The steps are saved. Criteria are a second write against the
      // mission's version; a failure there is reported, not hidden, and does
      // not undo the steps.
      let criteriaAdded = 0;
      let criteriaError: string | null = null;
      if (incoming.length && repository.updateMission) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const mission = await repository.getMission(id);
          if (!mission) break;
          const merged = mergeCriteria(mission.criteria, incoming);
          if (!merged.added.length) break;
          try {
            await repository.updateMission(id, {
              objective: composeMissionObjective({ name: mission.name, intent: mission.intent, criteria: merged.criteria }),
              expectedVersion: mission.version,
            });
            criteriaAdded = merged.added.length;
            break;
          } catch (error) {
            if (error instanceof MissionMutationConflictError && attempt === 0) continue;
            criteriaError = "The steps were added, but the success criteria could not be saved. Add them under “Edit this mission”.";
            break;
          }
        }
      }
      return NextResponse.json({ actions, criteriaAdded, criteriaError }, { status: 201 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Describe the work this action covers." }, { status: 400 });
    }
    if (title.length > MAX_TITLE) {
      return NextResponse.json({ error: `Keep the action under ${MAX_TITLE} characters.` }, { status: 400 });
    }
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

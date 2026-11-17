import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestOrigin } from "../../../../../lib/auth/redirect.mjs";
import { publicMissionSnapshot, shareIdOrNull } from "../../../../../lib/mission-share.mjs";
import { isTrustedSameOriginRequest } from "../../../../../lib/request-origin.mjs";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const REFUSED = "The link could not be created. Try again.";

/**
 * Publish this mission's result under a link, or refresh the link it has.
 * The browser sends nothing but the mission's address: the copy is built
 * here from the mission the signed-in person can read, filtered, and stored.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedSameOriginRequest(request)) return NextResponse.json({ error: REFUSED }, { status: 403 });
  const missionId = shareIdOrNull((await params).id);
  if (!missionId) return NextResponse.json({ error: REFUSED }, { status: 400 });

  let snapshot;
  try {
    const repository = await createSupabaseMissionRepository();
    const mission = await repository.getMission(missionId);
    if (!mission) return NextResponse.json({ error: REFUSED }, { status: 404 });
    const outcome = mission.outcomes[0];
    snapshot = publicMissionSnapshot({
      name: mission.name,
      intent: mission.intent,
      criteria: mission.criteria,
      completedSteps: mission.actions.filter((action) => action.status === "COMPLETED").map((action) => action.title),
      plannedSteps: mission.actions.filter((action) => action.status !== "COMPLETED" && action.status !== "CANCELLED").map((action) => action.title),
      status: mission.lifecycleStatus,
      progress: mission.progress,
      outcome: outcome ? { status: outcome.status, successScore: outcome.successScore, result: outcome.result } : undefined,
    });
  } catch (error) {
    const signedOut = error instanceof Error && error.message === "Authentication required.";
    return NextResponse.json({ error: signedOut ? "Authentication required." : REFUSED }, { status: signedOut ? 401 : 500 });
  }
  if (!snapshot) return NextResponse.json({ error: REFUSED }, { status: 422 });

  const supabase = await createSupabaseServerClient();
  const created = await supabase.rpc("create_mission_share", { p_mission_id: missionId, p_snapshot: snapshot });
  const shareId = shareIdOrNull(created.data);
  if (created.error || !shareId) return NextResponse.json({ error: REFUSED }, { status: 403 });
  return NextResponse.json({ url: `${resolveRequestOrigin(request.headers, request.url)}/share/m/${shareId}`, name: snapshot.name });
}

/** Withdraw the link. Anyone who opens it afterwards sees that it is gone. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedSameOriginRequest(request)) return NextResponse.json({ error: "Sharing could not be stopped. Try again." }, { status: 403 });
  const missionId = shareIdOrNull((await params).id);
  if (!missionId) return NextResponse.json({ error: "Sharing could not be stopped. Try again." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const revoked = await supabase.rpc("revoke_mission_share", { p_mission_id: missionId });
  if (revoked.error) return NextResponse.json({ error: "Sharing could not be stopped. Try again." }, { status: 403 });
  return NextResponse.json({ ok: true });
}

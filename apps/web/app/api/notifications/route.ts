import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";

export const dynamic = "force-dynamic";

// A signed-out caller is an ordinary state here, not a failure. This route is
// outside the middleware matcher, so the bell's poll reaches it even with no
// session; returning 503 for that filled the logs with errors and told the
// client nothing. An empty count is the honest answer.
const EMPTY = { count: 0 };
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  try {
    const repository = isSupabaseConfigured()
      ? await createSupabaseMissionRepository()
      : localMockMissionRepository;
    const missions = await repository.listMissions();
    const now = Date.now();
    const followUpWindow = now + 7 * 24 * 60 * 60 * 1000;
    const followUps = missions.reduce((count, mission) => count + mission.actions.filter((action) => {
      if (!action.followUpAt || action.status === "COMPLETED" || action.status === "CANCELLED") return false;
      const dueAt = Date.parse(action.followUpAt);
      return Number.isFinite(dueAt) && dueAt <= followUpWindow;
    }).length, 0);
    const waiting = missions.filter((mission) => mission.status === "WAITING").length;
    // A mission that states an outcome and holds no work is the easiest thing
    // to lose track of, and it was the one thing the badge never counted.
    const unplanned = missions.filter((mission) =>
      mission.status !== "COMPLETED"
      && mission.actions.filter((action) => action.status !== "CANCELLED").length === 0).length;
    return NextResponse.json({ count: waiting + followUps + unplanned }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/auth|session|jwt|not authenticated|unauthor/i.test(message)) {
      return NextResponse.json(EMPTY, NO_STORE);
    }
    return NextResponse.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ count: waiting + followUps }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

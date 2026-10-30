import { NextResponse } from "next/server";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { buildNotificationSummary } from "../../../lib/notifications.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ count: 0, items: [] }, { headers: { "Cache-Control": "no-store" } });
    const repository = await createSupabaseMissionRepository();
    const [missions, approvals] = await Promise.all([
      repository.listMissions(),
      repository.listPendingApprovals ? repository.listPendingApprovals() : Promise.resolve([]),
    ]);
    return NextResponse.json(buildNotificationSummary(missions, approvals), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

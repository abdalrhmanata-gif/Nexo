import { NextResponse } from "next/server";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ count: 0, items: [] }, { headers: { "Cache-Control": "no-store" } });
    const repository = await createSupabaseMissionRepository();
    const [missions, approvals] = await Promise.all([
      repository.listMissions(),
      repository.listPendingApprovals ? repository.listPendingApprovals() : Promise.resolve([]),
    ]);
    const waiting = missions.filter((mission) => mission.status === "WAITING");
    const items = [
      ...waiting.map((mission) => ({
        id: `mission-${mission.id}`,
        kind: "mission",
        title: mission.name,
        detail: "This mission is waiting for your input.",
        href: `/app/missions/${mission.id}`,
        createdAt: mission.updated,
      })),
      ...approvals.map((approval) => ({
        id: `approval-${approval.id}`,
        kind: "approval",
        title: approval.missionName || "Mission approval",
        detail: approval.actionTitle ? `Approval needed: ${approval.actionTitle}` : "A human decision is needed before this action can proceed.",
        href: "/app/business/approvals",
        createdAt: approval.createdAt,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    return NextResponse.json({ count: waiting.length + approvals.length, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

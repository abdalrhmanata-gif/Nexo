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
    const now = Date.now();
    const followUpWindow = now + 7 * 24 * 60 * 60 * 1000;
    const followUps = missions.flatMap((mission) => mission.actions
      .filter((action) => {
        if (!action.followUpAt || action.status === "COMPLETED" || action.status === "CANCELLED") return false;
        const dueAt = Date.parse(action.followUpAt);
        return Number.isFinite(dueAt) && dueAt <= followUpWindow;
      })
      .map((action) => ({
        id: `follow-up-${action.id}`,
        kind: "follow_up",
        title: mission.name,
        detail: action.title,
        href: `/app/missions/${mission.id}`,
        dueAt: action.followUpAt as string,
        overdue: Date.parse(action.followUpAt as string) < now,
      })))
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    const rankedItems = [
      ...waiting.map((mission) => ({
        id: `mission-${mission.id}`,
        kind: "mission",
        title: mission.name,
        detail: "This mission is waiting for your input.",
        href: `/app/missions/${mission.id}`,
        sortAt: Date.parse(mission.updated) || now,
      })),
      ...approvals.map((approval) => ({
        id: `approval-${approval.id}`,
        kind: "approval",
        title: approval.missionName || "Mission approval",
        detail: approval.actionTitle ? `Approval needed: ${approval.actionTitle}` : "A human decision is needed before this action can proceed.",
        href: `/app/business/approvals#approval-${approval.id}`,
        sortAt: Date.parse(approval.createdAt) || now,
      })),
      ...followUps.map((item) => ({
        ...item,
        detail: item.overdue ? `Overdue: ${item.detail}` : `Due within 7 days: ${item.detail}`,
        sortAt: Date.parse(item.dueAt),
      })),
    ].sort((a, b) => a.sortAt - b.sortAt).slice(0, 20);
    const items = rankedItems.map(({ sortAt: _sortAt, ...item }) => item);
    return NextResponse.json({ count: waiting.length + approvals.length + followUps.length, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

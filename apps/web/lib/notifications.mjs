const FOLLOW_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function buildNotificationSummary(missions, approvals, now = Date.now()) {
  const followUpWindow = now + FOLLOW_UP_WINDOW_MS;
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const followUps = missions.flatMap((mission) => mission.actions
    .filter((action) => {
      if (!action.followUpAt || action.status === "COMPLETED" || action.status === "CANCELLED") return false;
      const dueAt = Date.parse(action.followUpAt);
      return Number.isFinite(dueAt) && dueAt <= followUpWindow;
    })
    .map((action) => ({
      id: "follow-up-" + action.id,
      kind: "follow_up",
      title: mission.name,
      detail: action.title,
      href: "/app/missions/" + mission.id,
      dueAt: action.followUpAt,
      overdue: Date.parse(action.followUpAt) < now,
    })))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const rankedItems = [
    ...waiting.map((mission) => ({
      id: "mission-" + mission.id,
      kind: "mission",
      title: mission.name,
      detail: "This mission is waiting for your input.",
      href: "/app/missions/" + mission.id,
      sortAt: Date.parse(mission.updated) || now,
    })),
    ...approvals.map((approval) => ({
      id: "approval-" + approval.id,
      kind: "approval",
      title: approval.missionName || "Mission approval",
      detail: approval.actionTitle
        ? "Approval needed: " + approval.actionTitle
        : "A human decision is needed before this action can proceed.",
      href: "/app/business/approvals#approval-" + approval.id,
      requiresHumanDecision: true,
      sortAt: Date.parse(approval.createdAt) || now,
    })),
    ...followUps.map((item) => ({
      ...item,
      detail: (item.overdue ? "Overdue: " : "Due within 7 days: ") + item.detail,
      sortAt: Date.parse(item.dueAt),
    })),
  ].sort((a, b) => a.sortAt - b.sortAt).slice(0, 20);
  const items = rankedItems.map(({ sortAt: _sortAt, ...item }) => item);
  return {
    count: waiting.length + approvals.length + followUps.length,
    items,
  };
}

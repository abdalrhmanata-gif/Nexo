export function getBusinessFocus({ pendingApprovals, waitingMissions, activeMissions }) {
  if (pendingApprovals > 0) {
    return { kind: "approval", count: pendingApprovals, href: "/app/business/approvals" };
  }
  if (waitingMissions > 0) {
    return { kind: "waiting", count: waitingMissions, href: "/app" };
  }
  if (activeMissions > 0) {
    return { kind: "active", count: activeMissions, href: "/app" };
  }
  return { kind: "start", count: 0, href: "/app/missions/new" };
}

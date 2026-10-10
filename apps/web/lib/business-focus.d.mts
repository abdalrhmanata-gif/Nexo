export type BusinessFocus = {
  kind: "approval" | "waiting" | "active" | "start";
  count: number;
  href: string;
};

export declare function getBusinessFocus(counts: {
  pendingApprovals: number;
  waitingMissions: number;
  activeMissions: number;
}): BusinessFocus;

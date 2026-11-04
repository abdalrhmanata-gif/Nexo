export type NotificationMission = {
  id: string;
  name: string;
  status: string;
  updated: string;
  actions: Array<{
    id: string;
    title: string;
    status: string;
    followUpAt?: string | null;
  }>;
};

export type NotificationApproval = {
  id: string;
  createdAt: string;
  missionName?: string | null;
  actionTitle?: string | null;
};

export type NotificationItem = {
  id: string;
  kind: "mission" | "approval" | "follow_up";
  title: string;
  detail: string;
  href: string;
  requiresHumanDecision?: boolean;
  dueAt?: string;
  overdue?: boolean;
};

export declare function buildNotificationSummary(
  missions: NotificationMission[],
  approvals: NotificationApproval[],
  now?: number,
): { count: number; items: NotificationItem[] };

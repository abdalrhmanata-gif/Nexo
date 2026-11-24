export type MissionStatus = "ACTIVE" | "WAITING" | "COMPLETED";
export type MissionLifecycleStatus =
  | "DRAFT" | "PLANNING" | "READY" | "RUNNING" | "WAITING"
  | "NEEDS_USER" | "VERIFYING" | "COMPLETED" | "PAUSED"
  | "BLOCKED" | "FAILED" | "CANCELLED";
export type ActionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "BLOCKED" | "CANCELLED";

export type MissionAction = {
  id: string;
  title: string;
  status: ActionStatus;
  version: number;
  followUpAt: string | null;
  /** What the user recorded as proof when the step was done. */
  evidenceNote?: string | null;
  evidenceUrl?: string | null;
};

export type MissionActivity = {
  /** Set for a status change, so the page can show both states in the reader's language. */
  fromStatus?: string;
  toStatus?: string;
  /** A step marked done with a note or link. */
  withProof?: boolean;
  label: string;
  detail: string;
  time: string;
};

export type MissionVerification = {
  id: string;
  status: "VERIFIED" | "FAILED";
  criteria: Record<string, unknown>;
  evidence: Record<string, unknown>;
  confidence: number | null;
  failureReason: string | null;
  createdAt: string;
};

export type MissionOutcome = {
  id: string;
  verificationId: string;
  status: "COMPLETED" | "FAILED";
  result: Record<string, unknown>;
  successScore: number;
  verified: true;
  createdAt: string;
};

export type Mission = {
  id: string;
  version: number;
  lifecycleStatus: MissionLifecycleStatus;
  name: string;
  intent: string;
  status: MissionStatus;
  progress: number;
  actionsTotal: number;
  actionsCompleted: number;
  updated: string;
  owner: string;
  criteria: string[];
  actions: MissionAction[];
  activity: MissionActivity[];
  verifications: MissionVerification[];
  outcomes: MissionOutcome[];
};

export type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "warning" | "info";
};

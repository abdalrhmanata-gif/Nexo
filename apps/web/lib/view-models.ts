export type MissionStatus = "ACTIVE" | "WAITING" | "COMPLETED";
export type MissionLifecycleStatus =
  | "DRAFT" | "PLANNING" | "READY" | "RUNNING" | "WAITING"
  | "NEEDS_USER" | "VERIFYING" | "COMPLETED" | "PAUSED"
  | "BLOCKED" | "FAILED" | "CANCELLED";
export type MissionRisk = "LOW" | "MEDIUM";
export type ActionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "BLOCKED" | "CANCELLED";

export type MissionAction = {
  id: string;
  title: string;
  status: ActionStatus;
  version: number;
};

export type MissionActivity = {
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
  risk: MissionRisk;
  progress: number;
  budget: string;
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

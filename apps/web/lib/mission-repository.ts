import type { Mission, MissionAction, MissionOutcome, MissionVerification, MissionLifecycleStatus } from "./view-models";

export interface MissionRepository {
  listMissions(): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  createMission?(input: NewMission): Promise<Mission>;
  updateMission?(id: string, input: UpdateMission): Promise<Mission>;
  deleteMission?(id: string): Promise<void>;
  updateAction?(input: UpdateAction): Promise<MissionAction>;
  recordVerification?(input: NewVerification): Promise<MissionVerification>;
  commitOutcome?(input: NewOutcome): Promise<MissionOutcome>;
}

export type NewMission = { objective: string; actions?: string[] };
export type UpdateAction = {
  actionId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "BLOCKED" | "CANCELLED";
  expectedVersion: number;
};
export type UpdateMission = {
  objective?: string;
  status?: MissionLifecycleStatus;
  expectedVersion: number;
};
export class MissionMutationConflictError extends Error {
  constructor() {
    super("Mission changed elsewhere. Refresh and try again.");
    this.name = "MissionMutationConflictError";
  }
}
export type NewVerification = {
  missionId: string;
  status: "VERIFIED" | "FAILED";
  criteria: Record<string, unknown>;
  evidence: Record<string, unknown>;
  confidence?: number | null;
  failureReason?: string | null;
};
export type NewOutcome = {
  missionId: string;
  verificationId: string;
  result: Record<string, unknown>;
  successScore?: number;
  status?: "COMPLETED" | "FAILED";
};

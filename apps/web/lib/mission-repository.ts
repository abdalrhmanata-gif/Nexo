import type { Mission, MissionAction, MissionOutcome, MissionVerification, MissionLifecycleStatus } from "./view-models";

export interface MissionRepository {
  listMissions(): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  createMission?(input: NewMission): Promise<Mission>;
  updateMission?(id: string, input: UpdateMission): Promise<Mission>;
  deleteMission?(id: string): Promise<void>;
  addAction?(input: NewAction): Promise<MissionAction>;
  updateAction?(input: UpdateAction): Promise<MissionAction>;
  recordVerification?(input: NewVerification): Promise<MissionVerification>;
  commitOutcome?(input: NewOutcome): Promise<MissionOutcome>;
  recordResearchRun?(input: NewResearchRun): Promise<void>;
  listResearchRuns?(missionId: string): Promise<MissionResearchRun[]>;
  listWorkspaceAgents?(): Promise<WorkspaceAgent[]>;
  listWorkspaceMembers?(): Promise<WorkspaceMember[]>;
  listPendingApprovals?(): Promise<MissionApproval[]>;
  listAgentExecutions?(missionId: string): Promise<AgentExecution[]>;
  listWorkspaceInvitations?(): Promise<WorkspaceInvitation[]>;
  createWorkspaceInvitation?(input: { email: string; role: "admin" | "member" | "viewer"; tokenHash: string; expiresAt: string }): Promise<WorkspaceInvitation>;
  getWorkspaceInvitation?(tokenHash: string): Promise<WorkspaceInvitation | null>;
  acceptWorkspaceInvitation?(tokenHash: string): Promise<WorkspaceInvitation>;
  revokeWorkspaceInvitation?(invitationId: string): Promise<WorkspaceInvitation>;
  updateWorkspaceMemberRole?(memberId: string, role: "owner" | "admin" | "member" | "viewer"): Promise<WorkspaceMember>;
  removeWorkspaceMember?(memberId: string): Promise<WorkspaceMember>;
  listWorkspaceActivity?(): Promise<WorkspaceActivity[]>;
  startAgentExecution?(input: { missionId: string; actionId: string | null; agentId: string; idempotencyKey: string; request?: Record<string, unknown> }): Promise<Record<string, unknown>>;
  completeAgentExecution?(input: { executionId: string; status: "SUCCEEDED" | "FAILED" | "UNKNOWN" | "BLOCKED"; result?: Record<string, unknown>; evidence?: Record<string, unknown>; errorCode?: string; errorMessage?: string }): Promise<Record<string, unknown>>;
}

export type NewMission = { objective: string; actions?: string[] };
/**
 * A plan is not fixed at creation time. Adding an action later uses the same
 * insert path and the same row-level policies that mission creation already
 * relies on; ownership still comes from the session, never from the caller.
 */
export type NewAction = { missionId: string; title: string };
export type UpdateAction = {
  actionId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "BLOCKED" | "CANCELLED";
  expectedVersion: number;
  /**
   * Only sent when the caller is deliberately setting or removing a follow-up
   * date. Omitting it means "leave the stored follow-up alone", which keeps the
   * request identical to the pre-W18 contract.
   */
  setFollowUp?: boolean;
  followUpAt?: string | null;
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
/**
 * The database rejected the mutation for a stated, user-correctable reason.
 * Distinct from an authorization failure, which must stay opaque.
 */
export class MissionMutationRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissionMutationRejectedError";
  }
}

export class MissionProvenanceDeleteError extends Error {
  constructor() {
    super("Mission history prevents deletion.");
    this.name = "MissionProvenanceDeleteError";
  }
}
export type MissionResearchSource = { title: string; url: string };
export type MissionResearchRun = {
  runId: string;
  requestId: string;
  status: "COMPLETED";
  summary: string;
  sources: MissionResearchSource[];
  createdAt: string;
  verified: false;
};
export type NewResearchRun = {
  missionId: string;
  runId: string;
  requestId: string;
  summary: string;
  sources: MissionResearchSource[];
};

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

export type WorkspaceAgent = { id: string; name: string; description: string; status: "ACTIVE" | "PAUSED"; authority: Record<string, unknown>; };
export type WorkspaceMember = { id: string; userId: string; email: string | null; role: "owner" | "admin" | "member" | "viewer"; createdAt: string; };
export type WorkspaceActivity = { id: string; eventType: string; entityType: string; entityId: string | null; payload: Record<string, unknown>; actorUserId: string | null; createdAt: string; };
export type WorkspaceInvitation = { id: string; email: string; role: "admin" | "member" | "viewer"; status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED"; expiresAt: string; createdAt: string; };
export type MissionApproval = { id: string; missionId: string; actionId: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; requestedBy: string; decidedBy: string | null; requestedScope: Record<string, unknown>; decisionNote: string | null; createdAt: string; decidedAt: string | null; };
export type AgentExecution = { id: string; missionId: string; actionId: string | null; agentId: string; approvalId: string | null; status: "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "BLOCKED"; authoritySnapshot: Record<string, unknown>; request: Record<string, unknown>; result: Record<string, unknown> | null; evidence: Record<string, unknown> | null; createdAt: string; completedAt: string | null; };

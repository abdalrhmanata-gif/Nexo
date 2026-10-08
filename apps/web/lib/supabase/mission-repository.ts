import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { MissionMutationConflictError, MissionMutationRejectedError, MissionProvenanceDeleteError, type MissionRepository, type MissionResearchRun, type NewMission, type NewOutcome, type NewResearchRun, type NewVerification, type UpdateMission, type WorkspaceAgent, type WorkspaceMember, type WorkspaceInvitation, type MissionApproval } from "../mission-repository";import type { ActionStatus, Mission, MissionAction, MissionActivity, MissionOutcome, MissionVerification, MissionLifecycleStatus } from "../view-models";
import { formatDateTime, humaniseEventType, parseMissionObjective, summariseEventPayload } from "../mission-content.mjs";

type MissionRow = {
  id: string;
  objective: string;
  status: string;
  version: number;
  updated_at: string;
};

type ActionRow = {
  id: string;
  title: string;
  status: ActionStatus;
  version: number;
  follow_up_at: string | null;
};

type VerificationRow = {
  id: string;
  status: "VERIFIED" | "FAILED";
  criteria: Record<string, unknown>;
  evidence: Record<string, unknown>;
  confidence: number | null;
  failure_reason: string | null;
  created_at: string;
};

type OutcomeRow = {
  id: string;
  verification_id: string;
  status: "COMPLETED" | "FAILED";
  result: Record<string, unknown>;
  success_score: number;
  verified: true;
  created_at: string;
};

type EventRow = {
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type ResearchEventRow = {
  payload: Record<string, unknown>;
  created_at: string;
};

function toResearchRun(row: ResearchEventRow): MissionResearchRun | null {
  const runId = typeof row.payload.run_id === "string" ? row.payload.run_id : "";
  const requestId = typeof row.payload.request_id === "string" ? row.payload.request_id : "";
  const summary = typeof row.payload.summary === "string" ? row.payload.summary : "";
  const verified = row.payload.verified === false;
  const sourceRows = Array.isArray(row.payload.sources) ? row.payload.sources : [];
  const sources = sourceRows
    .map((source) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) return null;
      const item = source as Record<string, unknown>;
      const url = typeof item.url === "string" ? item.url : "";
      if (!url.startsWith("http")) return null;
      const title = typeof item.title === "string" && item.title.trim()
        ? item.title.trim().slice(0, 200)
        : url.slice(0, 500);
      return { title, url };
    })
    .filter((source): source is { title: string; url: string } => Boolean(source))
    .slice(0, 12);
  if (!runId || !requestId || !summary || !verified) return null;
  return {
    runId,
    requestId,
    status: "COMPLETED",
    summary,
    sources,
    createdAt: row.created_at,
    verified: false,
  };
}

function toVerification(row: VerificationRow): MissionVerification {
  return { id: row.id, status: row.status, criteria: row.criteria, evidence: row.evidence, confidence: row.confidence, failureReason: row.failure_reason, createdAt: row.created_at };
}

function toOutcome(row: OutcomeRow): MissionOutcome {
  return { id: row.id, verificationId: row.verification_id, status: row.status, result: row.result, successScore: row.success_score, verified: true, createdAt: row.created_at };
}

function toActivity(row: EventRow): MissionActivity {
  return { label: humaniseEventType(row.event_type), detail: summariseEventPayload(row.payload), time: formatDateTime(row.created_at) };
}

function toAction(row: ActionRow): MissionAction {
  return { id: row.id, title: row.title, status: row.status, version: row.version, followUpAt: row.follow_up_at ?? null };
}

function toMission(row: MissionRow, actions: ActionRow[] = [], verifications: MissionVerification[] = [], outcomes: MissionOutcome[] = [], activity: MissionActivity[] = []): Mission {
  const status = row.status === "WAITING" || row.status === "NEEDS_USER" ? "WAITING" : row.status === "COMPLETED" ? "COMPLETED" : "ACTIVE";
  const completed = actions.filter((action) => action.status === "COMPLETED").length;
  const resolved = actions.filter((action) => action.status === "COMPLETED" || action.status === "CANCELLED").length;
  const { name, intent, criteria } = parseMissionObjective(row.objective);
  return {
    id: row.id,
    version: row.version,
    lifecycleStatus: row.status as MissionLifecycleStatus,
    name,
    intent,
    status,
    progress: actions.length ? Math.round((resolved / actions.length) * 100) : status === "COMPLETED" ? 100 : 0,
    actionsTotal: actions.length,
    actionsCompleted: completed,
    updated: formatDateTime(row.updated_at),
    owner: "You",
    criteria,
    actions: actions.map(toAction),
    activity,
    verifications,
    outcomes,
  };
}

async function ownedWorkspace(supabase: SupabaseClient, userId: string) {
  const existing = await supabase.from("workspaces").select("id").eq("owner_id", userId).order("created_at").limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id as string;
  const created = await supabase.from("workspaces").insert({ owner_id: userId, name: "My workspace" }).select("id").single();
  if (created.error) throw created.error;
  return created.data.id as string;
}

async function actionsFor(supabase: SupabaseClient, missionId: string) {
  const result = await supabase
    .from("mission_actions")
    .select("id, title, status, version, follow_up_at")
    .eq("mission_id", missionId)
    .order("position");
  if (result.error) throw result.error;
  return result.data as ActionRow[];
}

async function historyFor(supabase: SupabaseClient, missionId: string) {
  const [verifications, outcomes, events] = await Promise.all([
    supabase.from("mission_verifications").select("id, status, criteria, evidence, confidence, failure_reason, created_at").eq("mission_id", missionId).order("created_at", { ascending: false }),
    supabase.from("mission_outcomes").select("id, verification_id, status, result, success_score, verified, created_at").eq("mission_id", missionId).order("created_at", { ascending: false }),
    supabase.from("mission_events").select("event_type, payload, created_at").eq("mission_id", missionId).order("created_at", { ascending: false }),
  ]);
  if (verifications.error) throw verifications.error;
  if (outcomes.error) throw outcomes.error;
  if (events.error) throw events.error;
  return {
    verifications: (verifications.data as VerificationRow[]).map(toVerification),
    outcomes: (outcomes.data as OutcomeRow[]).map(toOutcome),
    activity: (events.data as EventRow[]).map(toActivity),
  };
}

export async function createSupabaseMissionRepository(): Promise<MissionRepository> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");
  const workspaceId = await ownedWorkspace(supabase, user.id);
  const missionSelect = "id, objective, status, version, updated_at";

  async function completeMission(row: MissionRow) {
    const [actions, history] = await Promise.all([actionsFor(supabase, row.id), historyFor(supabase, row.id)]);
    return toMission(row, actions, history.verifications, history.outcomes, history.activity);
  }

  const MUTATION_REJECTIONS: Record<string, string> = {
    INVALID_ACTION_TRANSITION: "That is not a valid next state for this action.",
    FOLLOW_UP_REQUIRES_WAITING: "A follow-up date can only be set while an action is Waiting.",
    FOLLOW_UP_IN_PAST: "Choose a follow-up date that has not already passed.",
    FOLLOW_UP_TOO_DISTANT: "Choose a follow-up date within the next ten years.",
    INVALID_MISSION_TRANSITION: "That is not a valid next state for this mission.",
    // Verification and outcome are only accepted while the mission is being
    // checked. Without these the raw database label reached the user.
    MISSION_NOT_VERIFYING: "Move this mission to checking the evidence before recording verification or an outcome.",
    ALL_ACTIONS_MUST_BE_COMPLETED: "Every required action must be complete or intentionally cancelled before this mission can be recorded as complete.",
    VERIFIED_OUTCOME_REQUIRED: "Commit a passing verified outcome before completing this mission.",
    MISSION_ALREADY_COMPLETED: "This mission is complete. Create a new mission for additional work.",
    VERIFICATION_NOT_VERIFIED: "This outcome needs a verification that passed.",
    INVALID_VERIFICATION_STATUS: "A verification must record either a pass or a failure.",
    INVALID_VERIFICATION_PAYLOAD: "Describe both what you checked and the evidence you saw.",
    INVALID_VERIFICATION_CONFIDENCE: "Confidence must be between 0 and 1.",
    INVALID_OUTCOME_RESULT: "Describe what the outcome actually was.",
    INVALID_OUTCOME_SCORE: "The success score must be between 0 and 1.",
    INVALID_OUTCOME_STATUS: "An outcome must record either completion or failure.",
  };

  function throwMutationError(error: { code?: string; message?: string }) {
    if (error.code === "P0001" && error.message === "STALE_VERSION") {
      throw new MissionMutationConflictError();
    }
    const rejection = MUTATION_REJECTIONS[error.message ?? ""];
    if (rejection) throw new MissionMutationRejectedError(rejection);
    // PostgREST reports an unknown function signature as PGRST202. That means
    // the W18 migration has not been applied to this project yet, which is an
    // operator problem, not a user error. Never silently drop the follow-up.
    if (error.code === "PGRST202") {
      throw new MissionMutationRejectedError(
        "Follow-up dates are not available on this environment yet. The pending database migration must be applied first.",
      );
    }
    throw error;
  }

  return {
    async listMissions() {
      const result = await supabase.from("missions").select(missionSelect).eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      const rows = result.data as MissionRow[];
      if (!rows.length) return [];
      // The workspace list only needs enough state to show progress and the
      // next step, so actions are fetched once for every mission rather than
      // loading each mission's full verification and event history.
      const actions = await supabase
        .from("mission_actions")
        .select("id, title, status, version, follow_up_at, mission_id")
        .in("mission_id", rows.map((row) => row.id))
        .order("position");
      if (actions.error) throw actions.error;
      const byMission = new Map<string, ActionRow[]>();
      for (const action of actions.data as (ActionRow & { mission_id: string })[]) {
        const bucket = byMission.get(action.mission_id);
        if (bucket) bucket.push(action);
        else byMission.set(action.mission_id, [action]);
      }
      return rows.map((row) => toMission(row, byMission.get(row.id) ?? []));
    },
    async getMission(id) {
      const result = await supabase.from("missions").select(missionSelect).eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return null;
      return completeMission(result.data as MissionRow);
    },
    async createMission(input: NewMission) {
      const actionTitles = (input.actions ?? []).map((title) => title.trim()).filter(Boolean);
      const result = await supabase.rpc("create_mission_with_actions", {
        p_workspace_id: workspaceId,
        p_objective: input.objective,
        p_actions: actionTitles,
      });
      if (result.error) throw result.error;
      const missionRow = result.data as MissionRow;
      return toMission(
        missionRow,
        actionTitles.map((title, id) => ({
          id: `new-${id}`,
          title,
          status: "PENDING",
          version: 1,
          follow_up_at: null,
        })),
      );
    },
    async updateMission(id: string, input: UpdateMission) {
      if (input.objective !== undefined && input.status !== undefined) {
        throw new Error("Only one mission mutation may be submitted at a time.");
      }
      const result = input.status !== undefined
        ? await supabase.rpc("transition_mission", {
            p_mission_id: id,
            p_to_status: input.status,
            p_expected_version: input.expectedVersion,
          })
        : await supabase.rpc("update_mission_details", {
            p_mission_id: id,
            p_objective: input.objective,
            p_expected_version: input.expectedVersion,
          });
      if (result.error) throwMutationError(result.error);
      return completeMission(result.data as MissionRow);
    },
    async deleteMission(id: string) {
      const result = await supabase
        .from("missions")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select("id")
        .maybeSingle();
      if (result.error) {
        const message = [
          result.error.code,
          result.error.message,
          result.error.details,
          result.error.hint,
        ].filter((value): value is string => typeof value === "string").join(" ");
        if (result.error.code === "23503" && /mission_events(?:_mission_id_fkey)?/i.test(message)) {
          throw new MissionProvenanceDeleteError();
        }
        throw result.error;
      }
      // PostgREST can report no error when RLS or a stale ID matches no rows.
      // Do not tell the user deletion succeeded unless a row was actually removed.
      if (!result.data) throw new MissionMutationRejectedError("That mission is no longer available or cannot be deleted.");
    },
    async addAction(input) {
      // The mission is re-read through the workspace-scoped boundary first, so
      // an action can never be attached to a mission the session does not own.
      const mission = await supabase.from("missions").select("id").eq("id", input.missionId).eq("workspace_id", workspaceId).maybeSingle();
      if (mission.error) throw mission.error;
      if (!mission.data) throw new MissionMutationRejectedError("That mission is no longer available.");
      const last = await supabase.from("mission_actions").select("position").eq("mission_id", input.missionId).order("position", { ascending: false }).limit(1).maybeSingle();
      if (last.error) throw last.error;
      const position = (last.data?.position ?? -1) + 1;
      const result = await supabase
        .from("mission_actions")
        .insert({ mission_id: input.missionId, title: input.title, position, status: "PENDING" })
        .select("id, title, status, version, follow_up_at")
        .single();
      if (result.error) throwMutationError(result.error);
      return toAction(result.data as ActionRow);
    },
    async updateAction(input) {
      // The two follow-up parameters are only sent when the caller is actually
      // changing a follow-up date. A plain status change therefore keeps using
      // the exact pre-W18 three-argument call and cannot be affected by it.
      const args: Record<string, unknown> = {
        p_action_id: input.actionId,
        p_to_status: input.status,
        p_expected_version: input.expectedVersion,
      };
      if (input.setFollowUp) {
        args.p_follow_up_at = input.followUpAt ?? null;
        args.p_set_follow_up = true;
      }
      const result = await supabase.rpc("transition_mission_action", args);
      if (result.error) throwMutationError(result.error);
      return toAction(result.data as ActionRow);
    },
    async recordVerification(input: NewVerification) {
      const result = await supabase.rpc("create_mission_verification", {
        p_mission_id: input.missionId,
        p_status: input.status,
        p_criteria: input.criteria,
        p_evidence: input.evidence,
        p_confidence: input.confidence ?? null,
        p_failure_reason: input.failureReason ?? null,
      });
      if (result.error) throwMutationError(result.error);
      return toVerification(result.data as VerificationRow);
    },
    async commitOutcome(input: NewOutcome) {
      const result = await supabase.rpc("commit_verified_mission_outcome", {
        p_mission_id: input.missionId,
        p_verification_id: input.verificationId,
        p_result: input.result,
        p_success_score: input.successScore ?? 1,
        p_status: input.status ?? "COMPLETED",
      });
      if (result.error) throwMutationError(result.error);
      return toOutcome(result.data as OutcomeRow);
    },
    async recordResearchRun(input: NewResearchRun) {
      const result = await supabase.rpc("record_mission_event", {
        p_mission_id: input.missionId,
        p_event_type: "RESEARCH_RUN_COMPLETED",
        p_payload: {
          schema_version: 1,
          title: "Read-only research completed",
          execution: "read_only_research",
          status: "COMPLETED",
          run_id: input.runId,
          request_id: input.requestId,
          summary: input.summary.slice(0, 12000),
          sources: input.sources.slice(0, 12),
          source_count: input.sources.length,
          verified: false,
        },
      });
      if (result.error) throw result.error;
    },
    async startAgentExecution(input: { missionId: string; actionId: string | null; agentId: string; idempotencyKey: string; request?: Record<string, unknown> }) {
      const result = await supabase.rpc("start_agent_execution", {
        p_mission_id: input.missionId,
        p_action_id: input.actionId,
        p_agent_id: input.agentId,
        p_idempotency_key: input.idempotencyKey,
        p_request: input.request ?? {},
      });
      if (result.error) throw result.error;
      return result.data as Record<string, unknown>;
    },
    async completeAgentExecution(input: { executionId: string; status: "SUCCEEDED" | "FAILED" | "UNKNOWN" | "BLOCKED"; result?: Record<string, unknown>; evidence?: Record<string, unknown>; errorCode?: string; errorMessage?: string }) {
      const result = await supabase.rpc("complete_agent_execution", {
        p_execution_id: input.executionId,
        p_status: input.status,
        p_result: input.result ?? null,
        p_evidence: input.evidence ?? null,
        p_error_code: input.errorCode ?? null,
        p_error_message: input.errorMessage ?? null,
      });
      if (result.error) throw result.error;
      return result.data as Record<string, unknown>;
    },
    async listAgentExecutions(missionId: string) {
      const result = await supabase.from("agent_executions")
        .select("id,mission_id,action_id,agent_id,approval_id,status,authority_snapshot,request,result,evidence,created_at,completed_at")
        .eq("mission_id", missionId).order("created_at", { ascending: false }).limit(20);
      if (result.error) throw result.error;
      return (result.data ?? []).map((row) => ({
        id: row.id as string,
        missionId: row.mission_id as string,
        actionId: row.action_id as string | null,
        agentId: row.agent_id as string,
        approvalId: row.approval_id as string | null,
        status: row.status as "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "BLOCKED",
        authoritySnapshot: (row.authority_snapshot ?? {}) as Record<string, unknown>,
        request: (row.request ?? {}) as Record<string, unknown>,
        result: (row.result ?? null) as Record<string, unknown> | null,
        evidence: (row.evidence ?? null) as Record<string, unknown> | null,
        createdAt: row.created_at as string,
        completedAt: row.completed_at as string | null,
      }));
    },
    async listWorkspaceAgents() {
      const result = await supabase.from("workspace_agents").select("id,name,description,status,authority").eq("workspace_id", workspaceId).order("created_at");
      if (result.error) throw result.error;
      return (result.data ?? []) as WorkspaceAgent[];
    },
    async createWorkspaceInvitation(input) {
      const result = await supabase.rpc("create_workspace_invitation", {
        p_workspace_id: workspaceId,
        p_email: input.email,
        p_role: input.role,
        p_token_hash: input.tokenHash,
        p_expires_at: input.expiresAt,
      });
      if (result.error || !result.data) throw result.error ?? new Error("Invitation could not be created.");
      const row = result.data as {
        id: string;
        email: string;
        role: WorkspaceInvitation["role"];
        status: WorkspaceInvitation["status"];
        expires_at: string;
        created_at: string;
      };
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      };
    },
    async getWorkspaceInvitation(tokenHash) {
      const result = await supabase.rpc("get_workspace_invitation", { p_token_hash: tokenHash });
      if (result.error) throw result.error;
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row) return null;
      return {
        id: row.id as string,
        email: row.email as string,
        role: row.role as WorkspaceInvitation["role"],
        status: row.status as WorkspaceInvitation["status"],
        expiresAt: row.expires_at as string,
        createdAt: row.created_at as string,
      };
    },
    async acceptWorkspaceInvitation(tokenHash) {
      const result = await supabase.rpc("accept_workspace_invitation", { p_token_hash: tokenHash });
      if (result.error || !result.data) throw result.error ?? new Error("Invitation could not be accepted.");
      const row = result.data as { id: string; email: string; role: WorkspaceInvitation["role"]; status: WorkspaceInvitation["status"]; expires_at: string; created_at: string };
      return { id: row.id, email: row.email, role: row.role, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at };
    },
    async revokeWorkspaceInvitation(invitationId) {
      const result = await supabase.rpc("revoke_workspace_invitation", { p_invitation_id: invitationId });
      if (result.error || !result.data) throw result.error ?? new Error("Invitation could not be revoked.");
      const row = result.data as { id: string; email: string; role: WorkspaceInvitation["role"]; status: WorkspaceInvitation["status"]; expires_at: string; created_at: string };
      return { id: row.id, email: row.email, role: row.role, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at };
    },
    async listWorkspaceInvitations() {
      const result = await supabase.from("workspace_invitations").select("id,email,role,status,expires_at,created_at").eq("workspace_id", workspaceId).order("created_at",{ascending:false}).limit(20);
      if (result.error) throw result.error;
      return (result.data ?? []).map((row) => ({ id: row.id as string, email: row.email as string, role: row.role as WorkspaceInvitation["role"], status: row.status as WorkspaceInvitation["status"], expiresAt: row.expires_at as string, createdAt: row.created_at as string }));
    },
    async listWorkspaceMembers() {
      const result = await supabase.from("workspace_members").select("id,user_id,role,created_at").eq("workspace_id", workspaceId).order("created_at");
      if (result.error) throw result.error;
      return (result.data ?? []).map((row) => ({ id: row.id as string, userId: row.user_id as string, role: row.role as WorkspaceMember["role"], createdAt: row.created_at as string }));
    },
    async listPendingApprovals() {
      const result = await supabase.from("mission_approvals").select("id,mission_id,action_id,status,requested_by,decided_by,requested_scope,decision_note,created_at,decided_at").eq("workspace_id", workspaceId).eq("status","PENDING").order("created_at",{ascending:false});
      if (result.error) throw result.error;
      return (result.data ?? []).map((row) => ({ id: row.id as string, missionId: row.mission_id as string, actionId: row.action_id as string | null, status: row.status as MissionApproval["status"], requestedBy: row.requested_by as string, decidedBy: row.decided_by as string | null, requestedScope: (row.requested_scope ?? {}) as Record<string, unknown>, decisionNote: row.decision_note as string | null, createdAt: row.created_at as string, decidedAt: row.decided_at as string | null }));
    },
    async listResearchRuns(id: string) {
      const result = await supabase
        .from("mission_events")
        .select("payload, created_at")
        .eq("mission_id", id)
        .eq("event_type", "RESEARCH_RUN_COMPLETED")
        .order("created_at", { ascending: false })
        .limit(5);
      if (result.error) throw result.error;
      return (result.data as ResearchEventRow[])
        .map(toResearchRun)
        .filter((run): run is MissionResearchRun => Boolean(run));
    },
  };
}

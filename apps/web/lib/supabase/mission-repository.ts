import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { MissionMutationConflictError, MissionMutationRejectedError, type MissionRepository, type NewMission, type NewOutcome, type NewVerification, type UpdateMission } from "../mission-repository";import type { ActionStatus, Mission, MissionAction, MissionActivity, MissionOutcome, MissionVerification, MissionLifecycleStatus } from "../view-models";
import { humaniseEventType, parseMissionObjective, summariseEventPayload } from "../mission-content.mjs";

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

function toVerification(row: VerificationRow): MissionVerification {
  return { id: row.id, status: row.status, criteria: row.criteria, evidence: row.evidence, confidence: row.confidence, failureReason: row.failure_reason, createdAt: row.created_at };
}

function toOutcome(row: OutcomeRow): MissionOutcome {
  return { id: row.id, verificationId: row.verification_id, status: row.status, result: row.result, successScore: row.success_score, verified: true, createdAt: row.created_at };
}

function toActivity(row: EventRow): MissionActivity {
  return { label: humaniseEventType(row.event_type), detail: summariseEventPayload(row.payload), time: new Date(row.created_at).toLocaleString() };
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
    updated: new Date(row.updated_at).toLocaleString(),
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
      const result = await supabase.from("missions").insert({ workspace_id: workspaceId, owner_id: user.id, objective: input.objective, status: "DRAFT" }).select(missionSelect).single();
      if (result.error) throw result.error;
      const actionTitles = (input.actions ?? []).map((title) => title.trim()).filter(Boolean);
      if (actionTitles.length) {
        const actions = await supabase.from("mission_actions").insert(actionTitles.map((title, position) => ({
          mission_id: result.data.id,
          title,
          position,
          status: "PENDING",
        })));
        if (actions.error) {
          await supabase.from("missions").delete().eq("id", result.data.id).eq("workspace_id", workspaceId);
          throw actions.error;
        }
      }
      return toMission(result.data as MissionRow, actionTitles.map((title, id) => ({ id: `new-${id}`, title, status: "PENDING", version: 1, follow_up_at: null })));
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
      const result = await supabase.from("missions").delete().eq("id", id).eq("workspace_id", workspaceId);
      if (result.error) throw result.error;
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
  };
}

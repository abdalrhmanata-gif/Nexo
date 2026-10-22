import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { MissionMutationConflictError, type MissionRepository, type NewMission, type NewOutcome, type NewVerification, type UpdateMission } from "../mission-repository";
import type { ActionStatus, Mission, MissionAction, MissionActivity, MissionOutcome, MissionVerification, MissionLifecycleStatus } from "../view-models";

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
  return { label: row.event_type.replaceAll("_", " "), detail: Object.keys(row.payload).length ? JSON.stringify(row.payload) : "Mission history event", time: new Date(row.created_at).toLocaleString() };
}

function toAction(row: ActionRow): MissionAction {
  return { id: row.id, title: row.title, status: row.status, version: row.version };
}

function toMission(row: MissionRow, actions: ActionRow[] = [], verifications: MissionVerification[] = [], outcomes: MissionOutcome[] = [], activity: MissionActivity[] = []): Mission {
  const status = row.status === "WAITING" || row.status === "NEEDS_USER" ? "WAITING" : row.status === "COMPLETED" ? "COMPLETED" : "ACTIVE";
  const completed = actions.filter((action) => action.status === "COMPLETED").length;
  return {
    id: row.id,
    version: row.version,
    lifecycleStatus: row.status as MissionLifecycleStatus,
    name: row.objective.split("\n")[0].slice(0, 200),
    intent: row.objective,
    status,
    risk: "LOW",
    progress: actions.length ? Math.round((completed / actions.length) * 100) : status === "COMPLETED" ? 100 : 0,
    budget: "Not set",
    updated: new Date(row.updated_at).toLocaleString(),
    owner: "You",
    criteria: actions.map((action) => action.title),
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
    .select("id, title, status, version")
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

  function throwMutationError(error: { code?: string; message?: string }) {
    if (error.code === "P0001" && error.message === "STALE_VERSION") {
      throw new MissionMutationConflictError();
    }
    throw error;
  }

  return {
    async listMissions() {
      const result = await supabase.from("missions").select(missionSelect).eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      return Promise.all((result.data as MissionRow[]).map(async (row) => {
        return completeMission(row);
      }));
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
      return toMission(result.data as MissionRow, actionTitles.map((title, id) => ({ id: `new-${id}`, title, status: "PENDING", version: 1 })));
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
    async updateAction(input) {
      const result = await supabase.rpc("transition_mission_action", {
        p_action_id: input.actionId,
        p_to_status: input.status,
        p_expected_version: input.expectedVersion,
      });
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
      if (result.error) throw result.error;
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
      if (result.error) throw result.error;
      return toOutcome(result.data as OutcomeRow);
    },
  };
}

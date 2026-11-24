import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "../supabase/config";
import { missionRepositoryFor } from "../supabase/mission-repository";
import { createPlanDatesRepository } from "../supabase/plan-dates-repository";
import type { MissionRepository } from "../mission-repository";
import { missionTemplates } from "../mission-templates";
import { publicMissionSnapshot, shareIdOrNull } from "../mission-share.mjs";
import type { DueDate } from "../plan-dates.mjs";
import type { McpApi, McpMissionDates } from "./tools.mjs";
import { checkAccessToken, type TokenCheck } from "./identity.mjs";
import type { Mission } from "../view-models";

/**
 * A Supabase client that acts as the person who holds `token`: the OAuth
 * access token an assistant received when the person approved it on
 * zavqera.com. Nothing is stored and nothing runs with more rights than the
 * person has; row level security applies to every statement.
 */
export function clientForToken(token: string): SupabaseClient {
  if (!supabaseUrl || !supabasePublishableKey) throw new Error("Supabase is not configured.");
  return createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * The person behind a token: `{ id }`, null when it is missing, expired,
 * revoked or not issued by this project, or "unavailable" when Supabase Auth
 * could not answer. Asks Supabase Auth's userinfo endpoint for OAuth apps
 * rather than only checking the signature, so a connection the person
 * removed stops working at once (see lib/mcp/identity.mjs).
 */
export async function userForToken(client: SupabaseClient, token: string): Promise<TokenCheck> {
  if (!supabaseUrl || !supabasePublishableKey) return "unavailable";
  return checkAccessToken({
    supabaseUrl,
    apiKey: supabasePublishableKey,
    token,
    // Only if the userinfo endpoint does not exist on the server.
    fallback: async () => {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
  });
}

/** The tools' view of the person's workspace, built on the website's own repositories. */
export function createMcpApi(client: SupabaseClient, userId: string, origin: string): McpApi {
  // The repository ensures the person's workspace exists, which is a write;
  // it is made on first use, so initialize and tools/list never cause it.
  let repository: Promise<MissionRepository> | null = null;
  const missions = () => (repository ??= missionRepositoryFor(client, userId));
  let dates: ReturnType<typeof createPlanDatesRepository> | null = null;
  const planDates = () => (dates ??= createPlanDatesRepository(client));

  return {
    templates: missionTemplates.map(({ id, title, description, intent, criteria, actions }) => ({ id, title, description, intent, criteria, actions })),

    async listMissions() {
      return (await missions()).listMissions();
    },

    async getMission(id) {
      return (await missions()).getMission(id);
    },

    async datesFor(missionIds) {
      const result: Record<string, McpMissionDates> = {};
      for (const id of missionIds) result[id] = { targetDate: null, dueDates: {} };
      if (!missionIds.length) return result;
      // Dates are never fatal: if they cannot be read, the Missions are
      // still shown, undated.
      const [schedules, due] = await Promise.all([
        client.from("mission_schedules").select("mission_id, target_date").in("mission_id", missionIds),
        client.from("action_due_dates").select("mission_id, action_id, due_on, basis").in("mission_id", missionIds),
      ]);
      if (!schedules.error) {
        for (const row of (schedules.data ?? []) as { mission_id: string; target_date: string }[]) {
          if (result[row.mission_id]) result[row.mission_id].targetDate = row.target_date;
        }
      }
      if (!due.error) {
        for (const row of (due.data ?? []) as { mission_id: string; action_id: string; due_on: string; basis: string | null }[]) {
          const entry: DueDate = { dueOn: row.due_on, basis: row.basis === "law" ? "law" : null };
          if (result[row.mission_id]) result[row.mission_id].dueDates[row.action_id] = entry;
        }
      }
      return result;
    },

    async findRecentMission(objective, withinMinutes) {
      const repository = await missions();
      return repository.findRecentMission ? repository.findRecentMission(objective, withinMinutes) : null;
    },

    async createMission(input) {
      return (await missions()).createMission!(input);
    },

    async addSteps(missionId, titles) {
      return (await missions()).addActions!({ missionId, titles });
    },

    async completeStep(input) {
      return (await missions()).completeAction!({ actionId: input.actionId, expectedVersion: input.expectedVersion, evidenceNote: input.evidenceNote ?? null, evidenceUrl: input.evidenceUrl ?? null });
    },

    async setStepProof(input) {
      return (await missions()).setActionProof!({ actionId: input.actionId, expectedVersion: input.expectedVersion, evidenceNote: input.evidenceNote ?? null, evidenceUrl: input.evidenceUrl ?? null });
    },

    async updateStepStatus(input) {
      return (await missions()).updateAction!({
        actionId: input.actionId,
        status: input.status as "PENDING" | "RUNNING" | "COMPLETED" | "BLOCKED" | "CANCELLED",
        expectedVersion: input.expectedVersion,
        missionId: input.missionId,
      });
    },

    async setTargetDate(missionId, date) {
      await (await planDates()).setTargetDate(missionId, date);
    },

    async setStepDates(missionId, changes) {
      await (await planDates()).setStepDates(missionId, changes);
    },

    async shareMission(mission: Mission) {
      const outcome = mission.outcomes[0];
      const snapshot = publicMissionSnapshot({
        name: mission.name,
        intent: mission.intent,
        criteria: mission.criteria,
        completedSteps: mission.actions.filter((action) => action.status === "COMPLETED").map((action) => action.title),
        plannedSteps: mission.actions.filter((action) => action.status !== "COMPLETED" && action.status !== "CANCELLED").map((action) => action.title),
        status: mission.lifecycleStatus,
        progress: mission.progress,
        outcome: outcome ? { status: outcome.status, successScore: outcome.successScore, result: outcome.result } : undefined,
      });
      if (!snapshot) return null;
      const created = await client.rpc("create_mission_share", { p_mission_id: mission.id, p_snapshot: snapshot });
      const shareId = shareIdOrNull(created.data);
      if (created.error || !shareId) return null;
      return `${origin}/share/m/${shareId}`;
    },
  };
}

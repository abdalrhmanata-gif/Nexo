import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { supabasePublishableKey, supabaseUrl } from "./config";
import { isPlanDate, type CalendarFeedRow, type DueDate } from "../plan-dates.mjs";

export type MissionDates = { targetDate: string | null; dueDates: Record<string, DueDate> };

const EMPTY: MissionDates = { targetDate: null, dueDates: {} };

/** Why the database refused a calendar change, in terms the page can explain. */
export class PlanDatesError extends Error {
  readonly reason: "limit" | "forbidden" | "failed";
  constructor(reason: "limit" | "forbidden" | "failed") {
    super(reason);
    this.name = "PlanDatesError";
    this.reason = reason;
  }
}

function refusal(error: { code?: string; message?: string }): PlanDatesError {
  if (error.message?.includes("CALENDAR_LIMIT_REACHED")) return new PlanDatesError("limit");
  if (error.code === "42501" || error.message?.includes("row-level security")) return new PlanDatesError("forbidden");
  return new PlanDatesError("failed");
}

/**
 * A Mission's dates. Read separately from the Mission itself, and never
 * fatal: if the dates cannot be read the page still works without them.
 */
export async function readMissionDates(missionId: string): Promise<MissionDates> {
  try {
    const supabase = await createSupabaseServerClient();
    const [schedule, due] = await Promise.all([
      supabase.from("mission_schedules").select("target_date").eq("mission_id", missionId).maybeSingle(),
      supabase.from("action_due_dates").select("action_id, due_on, basis").eq("mission_id", missionId),
    ]);
    if (schedule.error || due.error) return EMPTY;
    const dueDates: Record<string, DueDate> = {};
    for (const row of (due.data ?? []) as { action_id: string; due_on: string; basis: string | null }[]) {
      dueDates[row.action_id] = { dueOn: row.due_on, basis: row.basis === "law" ? "law" : null };
    }
    const target = (schedule.data as { target_date?: string } | null)?.target_date ?? null;
    return { targetDate: target, dueDates };
  } catch {
    return EMPTY;
  }
}

type Written = PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>;

/**
 * Change the row if it exists, otherwise create it. Not an upsert on
 * purpose: PostgREST's upsert also rewrites the key columns, and the database
 * grants UPDATE only on the date columns, so an upsert is always refused (as
 * the live test on 24 Nov showed). If two saves race, the second insert finds
 * the row and updates it instead.
 */
async function updateOrInsert(update: () => Written, insert: () => Written) {
  const changed = await update();
  if (changed.error) throw refusal(changed.error);
  if (changed.data?.length) return;
  const created = await insert();
  if (created.error?.code === "23505") {
    const again = await update();
    if (again.error) throw refusal(again.error);
    if (again.data?.length) return;
  }
  if (created.error) throw refusal(created.error);
  if (!created.data?.length) throw new PlanDatesError("forbidden");
}

export async function createPlanDatesRepository() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");

  return {
    async setTargetDate(missionId: string, targetDate: string | null) {
      if (targetDate === null) {
        const result = await supabase.from("mission_schedules").delete().eq("mission_id", missionId);
        if (result.error) throw refusal(result.error);
        return;
      }
      if (!isPlanDate(targetDate)) throw new PlanDatesError("failed");
      await updateOrInsert(
        () => supabase.from("mission_schedules").update({ target_date: targetDate }).eq("mission_id", missionId).select("mission_id"),
        () => supabase.from("mission_schedules").insert({ mission_id: missionId, target_date: targetDate }).select("mission_id"),
      );
    },

    /** Sets, changes or clears several step dates of one Mission at once. */
    async setStepDates(missionId: string, changes: { actionId: string; dueOn: string | null; basis: "law" | null }[]) {
      const clear = changes.filter((change) => change.dueOn === null).map((change) => change.actionId);
      const set = changes
        .filter((change): change is { actionId: string; dueOn: string; basis: "law" | null } => change.dueOn !== null && isPlanDate(change.dueOn))
        .map((change) => ({ action_id: change.actionId, mission_id: missionId, due_on: change.dueOn, basis: change.basis }));
      if (clear.length) {
        const result = await supabase.from("action_due_dates").delete().eq("mission_id", missionId).in("action_id", clear);
        if (result.error) throw refusal(result.error);
      }
      for (const row of set) {
        await updateOrInsert(
          () => supabase.from("action_due_dates").update({ due_on: row.due_on, basis: row.basis }).eq("action_id", row.action_id).eq("mission_id", missionId).select("action_id"),
          () => supabase.from("action_due_dates").insert(row).select("action_id"),
        );
      }
    },

    async calendarMissionIds(): Promise<string[]> {
      const result = await supabase.from("calendar_missions").select("mission_id, added_at").order("added_at", { ascending: true });
      if (result.error) throw refusal(result.error);
      return ((result.data ?? []) as { mission_id: string }[]).map((row) => row.mission_id);
    },

    async addToCalendar(missionId: string) {
      const result = await supabase.from("calendar_missions").insert({ mission_id: missionId });
      // Already there is not an error: the person pressed twice.
      if (result.error && result.error.code !== "23505") throw refusal(result.error);
    },

    async removeFromCalendar(missionId: string) {
      const result = await supabase.from("calendar_missions").delete().eq("mission_id", missionId);
      if (result.error) throw refusal(result.error);
    },

    /** The person's calendar link token, made on first use; rotate replaces it. */
    async feedToken(rotate = false): Promise<string> {
      const result = await supabase.rpc("calendar_feed_token", { p_rotate: rotate });
      if (result.error || typeof result.data !== "string") throw new PlanDatesError("failed");
      return result.data;
    },
  };
}

/**
 * What a calendar link shows. Called without a session, as calendars call
 * it: the token is the only credential, checked inside the database.
 */
export async function readCalendarFeed(token: string): Promise<CalendarFeedRow[]> {
  if (!supabaseUrl || !supabasePublishableKey) return [];
  const supabase = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await supabase.rpc("calendar_feed_events", { p_token: token });
  if (result.error) throw result.error;
  return (result.data ?? []) as CalendarFeedRow[];
}

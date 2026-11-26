import { createSupabaseServerClient, getAuthenticatedUser } from "./server";
import { repeatErrorReason, type Repeat, type RepeatRule } from "../repeats.mjs";

// Repeating checklists, read and changed through the database functions in
// supabase/migrations/20261127090000_repeating_checklists.sql. Every call
// runs as the signed-in person; the database decides what they may do.

type RepeatRow = {
  id: string;
  frequency: Repeat["frequency"];
  weekdays: number[] | null;
  weekday: number | null;
  month_day: number | null;
  time_zone: string;
  created_by: string;
  source_mission_id: string | null;
};

const COLUMNS = "id, frequency, weekdays, weekday, month_day, time_zone, created_by, source_mission_id";

function toRepeat(row: RepeatRow): Repeat {
  return {
    id: row.id,
    frequency: row.frequency,
    weekdays: row.weekdays ?? [],
    weekday: row.weekday,
    monthDay: row.month_day,
    timeZone: row.time_zone,
    createdBy: row.created_by,
    sourceMissionId: row.source_mission_id,
  };
}

export class RepeatError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "RepeatError";
    this.reason = reason;
  }
}

/**
 * The running repeat a checklist belongs to: the one set up on it, or the
 * one that made it. Null when there is none, or it cannot be read.
 */
export async function readRepeatFor(missionId: string): Promise<Repeat | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const set = await supabase.from("mission_repeats").select(COLUMNS).eq("source_mission_id", missionId).eq("active", true).maybeSingle();
    if (!set.error && set.data) return toRepeat(set.data as RepeatRow);
    const run = await supabase.from("mission_repeat_runs").select("repeat_id").eq("mission_id", missionId).maybeSingle();
    const repeatId = (run.data as { repeat_id?: string } | null)?.repeat_id;
    if (run.error || !repeatId) return null;
    const found = await supabase.from("mission_repeats").select(COLUMNS).eq("id", repeatId).eq("active", true).maybeSingle();
    return found.error || !found.data ? null : toRepeat(found.data as RepeatRow);
  } catch {
    return null;
  }
}

/** How many repeats this person has running. */
export async function countOwnRepeats(): Promise<number> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return 0;
    const supabase = await createSupabaseServerClient();
    const found = await supabase.from("mission_repeats").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("active", true);
    return found.count ?? 0;
  } catch {
    return 0;
  }
}

export async function createRepeat(missionId: string, rule: RepeatRule): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("create_mission_repeat", {
    p_mission_id: missionId,
    p_frequency: rule.frequency,
    p_weekdays: rule.weekdays,
    p_weekday: rule.weekday,
    p_month_day: rule.monthDay,
    p_time_zone: rule.timeZone,
  });
  if (result.error) throw new RepeatError(repeatErrorReason(result.error.message));
  return String(result.data);
}

export async function stopRepeat(repeatId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("stop_mission_repeat", { p_repeat_id: repeatId });
  if (result.error) throw new RepeatError("failed");
}

/**
 * Make today's checklists for every repeat in the person's workspaces. Runs
 * when the workspace is opened. A failure never stops the page: the list
 * shows what exists, and the next visit tries again.
 */
export async function runDueRepeats(): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.rpc("run_due_mission_repeats");
    return result.error ? 0 : Number(result.data) || 0;
  } catch {
    return 0;
  }
}

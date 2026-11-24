"use server";

import { redirect } from "next/navigation";
import { legalDeadlineForStep, legalDueDate } from "../../../lib/legal-deadlines";
// A UUID check: Mission ids arrive from forms and never reach a query unchecked.
import { isTemplateId as isUuid } from "../../../lib/own-templates.mjs";
import { isPlanDate } from "../../../lib/plan-dates.mjs";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { createPlanDatesRepository, PlanDatesError } from "../../../lib/supabase/plan-dates-repository";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};

const reasonOf = (error: unknown) => (error instanceof PlanDatesError ? error.reason : "failed");

// As in the templates actions: work out where to go inside try/catch and
// redirect after it, so a catch never swallows the redirect.

/**
 * Saves a Mission's dates from one form: the target date, a date per step
 * ("due:<step id>"), and for a step with a legal deadline the date it counts
 * from ("from:<step id>"), which sets the step's date by law. An empty field
 * clears that date. The database allows this only to the Mission's owner.
 */
export async function saveMissionDates(formData: FormData) {
  const missionId = field(formData, "missionId");
  if (!isUuid(missionId)) redirect("/app");
  let target = `/app/missions/${missionId}?dates=saved#plan-dates`;
  try {
    // Only steps of this Mission, read with the person's own access.
    const mission = await (await createSupabaseMissionRepository()).getMission(missionId);
    if (!mission) {
      target = "/app";
    } else {
      const targetDate = field(formData, "targetDate");
      const repository = await createPlanDatesRepository();
      const changes: { actionId: string; dueOn: string | null; basis: "law" | null }[] = [];
      let bad = Boolean(targetDate) && !isPlanDate(targetDate);
      for (const action of mission.actions) {
        if (action.status === "CANCELLED") continue;
        const from = formData.has(`from:${action.id}`) ? field(formData, `from:${action.id}`) : null;
        const deadline = from !== null ? legalDeadlineForStep(action.title) : null;
        if (deadline && from) {
          if (!isPlanDate(from)) { bad = true; continue; }
          changes.push({ actionId: action.id, dueOn: legalDueDate(deadline, from), basis: "law" });
          continue;
        }
        if (!formData.has(`due:${action.id}`)) continue;
        const due = field(formData, `due:${action.id}`);
        if (due && !isPlanDate(due)) { bad = true; continue; }
        // A date already set by law stays marked as law when its "from" field is
        // left empty; only a step the law applies to can carry that mark.
        const keepsLaw = field(formData, `basis:${action.id}`) === "law" && legalDeadlineForStep(action.title) !== null;
        changes.push({ actionId: action.id, dueOn: due || null, basis: due && keepsLaw ? "law" : null });
      }
      if (bad) {
        target = `/app/missions/${missionId}?dates=invalid#plan-dates`;
      } else {
        await repository.setTargetDate(missionId, targetDate || null);
        await repository.setStepDates(missionId, changes);
      }
    }
  } catch (error) {
    target = `/app/missions/${missionId}?dates=${reasonOf(error)}#plan-dates`;
  }
  redirect(target);
}

const back = (formData: FormData, missionId: string, status: string) =>
  field(formData, "from") === "calendar" ? `/app/calendar?status=${status}` : `/app/missions/${missionId}?calendar=${status}#plan-dates`;

export async function addMissionToCalendar(formData: FormData) {
  const missionId = field(formData, "missionId");
  if (!isUuid(missionId)) redirect("/app");
  let target = back(formData, missionId, "added");
  try {
    const repository = await createPlanDatesRepository();
    await repository.addToCalendar(missionId);
    // Make sure the link exists, so the next page can show it.
    await repository.feedToken();
  } catch (error) {
    target = back(formData, missionId, reasonOf(error));
  }
  redirect(target);
}

export async function removeMissionFromCalendar(formData: FormData) {
  const missionId = field(formData, "missionId");
  if (!isUuid(missionId)) redirect("/app");
  let target = back(formData, missionId, "removed");
  try {
    await (await createPlanDatesRepository()).removeFromCalendar(missionId);
  } catch (error) {
    target = back(formData, missionId, reasonOf(error));
  }
  redirect(target);
}

/** A new link; every calendar subscribed to the old one stops receiving anything. */
export async function replaceCalendarLink() {
  let target = "/app/calendar?status=replaced";
  try {
    await (await createPlanDatesRepository()).feedToken(true);
  } catch {
    target = "/app/calendar?status=failed";
  }
  redirect(target);
}

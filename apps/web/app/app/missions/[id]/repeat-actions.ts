"use server";

import { redirect } from "next/navigation";
import { parseRepeatForm } from "../../../../lib/repeats.mjs";
import { createRepeat, RepeatError, stopRepeat } from "../../../../lib/supabase/repeat-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

// Each action works out where to go inside try/catch and redirects after it:
// redirect() throws, and a catch must never swallow it.

/** "Repeat this checklist" on a checklist's page. */
export async function setMissionRepeat(formData: FormData) {
  const missionId = field(formData, "missionId");
  if (!UUID.test(missionId)) redirect("/app");
  let target = `/app/missions/${missionId}?repeat=failed#repeat`;
  const parsed = parseRepeatForm((name) => field(formData, name), (name) => formData.getAll(name).filter((value): value is string => typeof value === "string"));
  if (!parsed.ok) {
    target = `/app/missions/${missionId}?repeat=${parsed.reason}#repeat`;
  } else {
    try {
      await createRepeat(missionId, parsed.rule);
      target = `/app/missions/${missionId}?repeat=set#repeat`;
    } catch (error) {
      target = `/app/missions/${missionId}?repeat=${error instanceof RepeatError ? error.reason : "failed"}#repeat`;
    }
  }
  redirect(target);
}

/** "Stop repeating": the checklists already made stay. */
export async function stopMissionRepeat(formData: FormData) {
  const missionId = field(formData, "missionId");
  const repeatId = field(formData, "repeatId");
  if (!UUID.test(missionId) || !UUID.test(repeatId)) redirect("/app");
  let target = `/app/missions/${missionId}?repeat=failed#repeat`;
  try {
    await stopRepeat(repeatId);
    target = `/app/missions/${missionId}?repeat=stopped#repeat`;
  } catch {
    target = `/app/missions/${missionId}?repeat=failed#repeat`;
  }
  redirect(target);
}

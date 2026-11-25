"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLanguage } from "../../../lib/i18n-server";
import { composeMissionObjective } from "../../../lib/mission-content.mjs";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { buildStartPlan, readStartRequest, startPath, startQuery } from "../../../lib/start-plan";
import { START_COOKIE, startCookieOptions, startToken } from "../../../lib/start-plan-token";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * "Save this plan". Signed in: the mission is created (or found, if this same
 * plan was saved minutes ago) and the person lands on it. Not signed in: the
 * plan is remembered in a cookie and the person goes to sign-up, after which
 * /app/start saves it without asking again.
 */
export async function savePlan(formData: FormData) {
  const request = readStartRequest({
    goal: field(formData, "goal"),
    template: field(formData, "template"),
    guide: field(formData, "guide"),
    checklist: field(formData, "checklist"),
    lang: field(formData, "lang"),
  }, await getLanguage());
  if (!request) redirect("/try");

  const store = await cookies();
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      signedIn = Boolean((await supabase.auth.getUser()).data.user);
    } catch {
      signedIn = false;
    }
  }
  if (!signedIn) {
    store.set(START_COOKIE, startToken(request), startCookieOptions);
    redirect(`/auth/sign-up?next=${encodeURIComponent(startPath(request))}`);
  }

  const plan = buildStartPlan(request);
  const objective = composeMissionObjective({ name: plan.name, intent: plan.intent, criteria: plan.criteria });
  let missionId: string | null = null;
  try {
    const repository = await createSupabaseMissionRepository();
    missionId = await repository.findRecentMission?.(objective, 30) ?? null;
    if (!missionId) missionId = (await repository.createMission!({ objective, actions: plan.actions })).id;
  } catch {
    missionId = null;
  }
  // Removed either way: a failed save must not be retried on its own in a
  // loop, and a saved one is done.
  store.delete(START_COOKIE);
  if (!missionId) redirect(`/app/start?${startQuery(request)}&error=save`);
  redirect(`/app/missions/${missionId}?welcome=1`);
}

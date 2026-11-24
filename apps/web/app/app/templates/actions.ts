"use server";

import { redirect } from "next/navigation";
import { cleanTemplateName, hasOwnTemplates, isTemplateId, missionFromTemplate, templateFromMission } from "../../../lib/own-templates.mjs";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { createOwnTemplateRepository, OwnTemplateError, readCurrentPlan } from "../../../lib/supabase/own-template-repository";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

const reasonOf = (error: unknown) => (error instanceof OwnTemplateError ? error.reason : "failed");

// Every action works out where to go inside try/catch and redirects after
// it: redirect() throws, and a catch must never swallow it.

/** "Save as my template" on a Mission page. */
export async function saveMissionAsTemplate(formData: FormData) {
  const missionId = field(formData, "missionId");
  if (!isTemplateId(missionId)) redirect("/app");
  let target = `/app/missions/${missionId}?template=failed#own-template`;
  try {
    if (!hasOwnTemplates(await readCurrentPlan())) {
      target = `/app/missions/${missionId}?template=plan#own-template`;
    } else {
      // Read through the mission repository: only a Mission this person can
      // open in their current workspace can become their template.
      const mission = await (await createSupabaseMissionRepository()).getMission(missionId);
      if (!mission) {
        target = "/app";
      } else {
        const made = templateFromMission(mission, field(formData, "name"));
        if (!made.ok) {
          target = `/app/missions/${missionId}?template=${made.reason}#own-template`;
        } else {
          const id = await (await createOwnTemplateRepository()).create(made.template);
          target = `/app/templates?saved=${id}`;
        }
      }
    }
  } catch (error) {
    target = `/app/missions/${missionId}?template=${reasonOf(error)}#own-template`;
  }
  redirect(target);
}

/** "Start a Mission from it": a new Mission with the template's plan. */
export async function startFromOwnTemplate(formData: FormData) {
  const id = field(formData, "id");
  let target = "/app/templates?error=failed";
  try {
    if (!hasOwnTemplates(await readCurrentPlan())) {
      target = "/app/templates?error=plan";
    } else {
      const template = await (await createOwnTemplateRepository()).get(id);
      if (!template) {
        target = "/app/templates?error=missing";
      } else {
        const mission = await (await createSupabaseMissionRepository()).createMission!(missionFromTemplate(template));
        target = `/app/missions/${mission.id}?welcome=1`;
      }
    }
  } catch (error) {
    target = `/app/templates?error=${reasonOf(error)}`;
  }
  redirect(target);
}

export async function renameOwnTemplate(formData: FormData) {
  const id = field(formData, "id");
  const name = cleanTemplateName(field(formData, "name"));
  let target = "/app/templates?renamed=1";
  try {
    if (!name) target = "/app/templates?error=name";
    else if (!hasOwnTemplates(await readCurrentPlan())) target = "/app/templates?error=plan";
    else await (await createOwnTemplateRepository()).rename(id, name);
  } catch (error) {
    target = `/app/templates?error=${reasonOf(error)}`;
  }
  redirect(target);
}

/** Deleting is always allowed, on any plan: the templates are the person's own. */
export async function deleteOwnTemplate(formData: FormData) {
  const id = field(formData, "id");
  let target = "/app/templates?deleted=1";
  try {
    await (await createOwnTemplateRepository()).remove(id);
  } catch (error) {
    target = `/app/templates?error=${reasonOf(error)}`;
  }
  redirect(target);
}

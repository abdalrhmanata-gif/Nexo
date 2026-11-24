// Own templates: the pure part. Which plans have them, the bounds the
// database enforces, and turning a Mission into a template and back.
// The database (supabase/migrations/20261124150000_own_templates.sql) is the
// authority on every rule here; this module mirrors it so the page can say
// what is wrong before a request is refused.

import { composeMissionObjective } from "./mission-content.mjs";

/** Plans that can save, change and use their own templates. */
export const OWN_TEMPLATE_PLANS = Object.freeze(["pro", "scale"]);

/** Templates one person can keep. A storage safeguard, enforced by a trigger. */
export const OWN_TEMPLATE_LIMIT = 100;

/** The column checks on public.user_templates, in characters and items. */
export const OWN_TEMPLATE_BOUNDS = Object.freeze({
  name: 200,
  intent: 3000,
  criteria: 20,
  criterion: 500,
  actions: 50,
  action: 2000,
});

export function hasOwnTemplates(plan) {
  return typeof plan === "string" && OWN_TEMPLATE_PLANS.includes(plan);
}

/** A template name as the database accepts it: trimmed, one line, bounded. */
export function cleanTemplateName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, OWN_TEMPLATE_BOUNDS.name).trim();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids arrive from forms; anything that is not a UUID never reaches a query. */
export function isTemplateId(value) {
  return typeof value === "string" && UUID.test(value);
}

/**
 * The template a Mission would make: its name (or the one given), intent,
 * success criteria and every step that was not cancelled, in order. Step
 * status and proof are not copied: a template is the plan, not the history.
 *
 * Returns { ok: true, template } or { ok: false, reason } where reason is
 * "no-name", "no-steps" or "too-many-steps".
 */
export function templateFromMission(mission, name) {
  const templateName = cleanTemplateName(name) || cleanTemplateName(mission?.name);
  if (!templateName) return { ok: false, reason: "no-name" };
  const actions = (Array.isArray(mission?.actions) ? mission.actions : [])
    .filter((action) => action && action.status !== "CANCELLED")
    .map((action) => (typeof action.title === "string" ? action.title.trim() : ""))
    .filter(Boolean)
    .map((title) => title.slice(0, OWN_TEMPLATE_BOUNDS.action).trim());
  if (!actions.length) return { ok: false, reason: "no-steps" };
  if (actions.length > OWN_TEMPLATE_BOUNDS.actions) return { ok: false, reason: "too-many-steps" };
  const criteria = (Array.isArray(mission?.criteria) ? mission.criteria : [])
    .map((criterion) => (typeof criterion === "string" ? criterion.trim() : ""))
    .filter(Boolean)
    .slice(0, OWN_TEMPLATE_BOUNDS.criteria)
    .map((criterion) => criterion.slice(0, OWN_TEMPLATE_BOUNDS.criterion).trim());
  const intent = (typeof mission?.intent === "string" ? mission.intent.trim() : "").slice(0, OWN_TEMPLATE_BOUNDS.intent).trim();
  return { ok: true, template: { name: templateName, intent, criteria, actions } };
}

/** What a new Mission from this template is created with. */
export function missionFromTemplate(template) {
  return {
    objective: composeMissionObjective({ name: template.name, intent: template.intent ?? "", criteria: template.criteria ?? [] }),
    actions: [...(template.actions ?? [])],
  };
}

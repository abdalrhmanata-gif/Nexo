// One plan, three ways in: a goal typed into the box on the home page, a
// mission template, or a guide. Each is described by a short request
// (?goal=, ?template= or ?guide=, plus ?lang=) and the plan is always rebuilt
// from that request on the server. Steps are never taken from a browser, so a
// crafted link can name a goal but cannot write the plan's text.

import { fill, isSupportedLanguage, translate, type AppLanguage } from "./i18n";
import { missionTemplateById } from "./mission-templates";
import { guideBySlug, guidePath } from "./guides";
import { checklistBySlug, checklistMission, checklistPath } from "./checklists";
import { planHeadline, planOfKind } from "./mission-planner.mjs";
import { GOAL_MIN_LENGTH, goalTitle, matchGoal, normaliseGoal, type GoalMatch } from "./goal-plan.mjs";

export type StartRequest =
  | { kind: "goal"; value: string; lang: AppLanguage }
  | { kind: "template"; value: string; lang: AppLanguage }
  | { kind: "guide"; value: string; lang: AppLanguage }
  | { kind: "checklist"; value: string; lang: AppLanguage };

export type StartPlan = {
  request: StartRequest;
  /** Where the plan comes from, for the line above it and its link. */
  basis: { source: "guide" | "template" | "checklist" | "planner"; id: string; label: string; href: string | null };
  name: string;
  intent: string;
  headline: string;
  criteria: string[];
  actions: string[];
  licensed: boolean;
};

/**
 * What the planner's own plans aim at, one sentence per kind. Written as an
 * intent the person could have stated, with no fact in it to go stale.
 */
const PLANNER_INTENTS: Record<string, string> = {
  move: "Decide on the move with the permits, costs and recognition checked at the official source, and a date to decide.",
  travel: "Plan the trip with the entry rules checked for my passport, the full cost written down, and a fallback for each leg.",
  study: "Choose the course on its real entry requirements, cost and recognition, with a checkpoint to confirm it is still worth it.",
  hiring: "Hire for the work that is not getting done, with a clear budget, a real test task and a date to decide.",
  product: "Test the riskiest assumption cheaply before building more, and decide on the evidence by a set date.",
  venture: "Open it on checked facts: the licence requirements in writing, real prices nearby, and a break-even number.",
  generic: "Reach this outcome on evidence: check what must be true, test the riskiest part first, and decide by a set date.",
};

type Params = Record<string, string | string[] | undefined | null>;

const first = (value: string | string[] | undefined | null) => (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * The request a page or a form names, or null when it names nothing usable:
 * an unknown template or guide, or a goal too short to read.
 */
export function readStartRequest(params: Params, fallbackLanguage: AppLanguage): StartRequest | null {
  const requested = first(params.lang);
  const lang: AppLanguage = isSupportedLanguage(requested) ? requested : fallbackLanguage;
  const template = first(params.template);
  if (template) return missionTemplateById(template) ? { kind: "template", value: template, lang } : null;
  const guide = first(params.guide);
  if (guide) return guideBySlug(guide, "en") ? { kind: "guide", value: guide, lang } : null;
  const checklist = first(params.checklist);
  if (checklist) return checklistBySlug(checklist) ? { kind: "checklist", value: checklist, lang } : null;
  const goal = normaliseGoal(first(params.goal));
  return goal.length >= GOAL_MIN_LENGTH ? { kind: "goal", value: goal, lang } : null;
}

/** The request as a query string, always in the same order. */
export function startQuery(request: StartRequest) {
  return new URLSearchParams({ [request.kind]: request.value, lang: request.lang }).toString();
}

/** Where a signed-in person lands to save the plan. */
export function startPath(request: StartRequest) {
  return `/app/start?${startQuery(request)}`;
}

/** The plan for a request, in the request's language. */
export function buildStartPlan(request: StartRequest): StartPlan {
  const t = (en: string) => translate(en, request.lang);
  if (request.kind === "template") return templatePlan(request, request.value, null, t);
  if (request.kind === "guide") return guidePlan(request, request.value, null, t);
  if (request.kind === "checklist") return checklistPlan(request, request.value, t);
  const match: GoalMatch = matchGoal(request.value) ?? { source: "planner", id: "generic", licensed: false };
  const title = goalTitle(request.value);
  if (match.source === "template" && missionTemplateById(match.id)) return templatePlan(request, match.id, title, t);
  if (match.source === "guide" && guideBySlug(match.id, request.lang)) return guidePlan(request, match.id, title, t);
  const plan = planOfKind(match.id, { licensed: Boolean(match.licensed) });
  return {
    request,
    basis: { source: "planner", id: plan.kind, label: t("A first plan built from the words you used"), href: null },
    name: title,
    intent: t(PLANNER_INTENTS[plan.kind] ?? PLANNER_INTENTS.generic),
    headline: t(planHeadline(plan.kind)),
    criteria: plan.criteria.map(t),
    actions: plan.steps.map(t),
    licensed: plan.licensed,
  };
}

function templatePlan(request: StartRequest, id: string, title: string | null, t: (en: string) => string): StartPlan {
  const template = missionTemplateById(id)!;
  return {
    request,
    basis: { source: "template", id, label: fill(t("From the template “{name}”"), { name: t(template.title) }), href: `/templates/${id}` },
    name: title ?? t(template.title),
    intent: t(template.intent),
    headline: t(template.title),
    criteria: template.criteria.map(t),
    actions: template.actions.map(t),
    licensed: false,
  };
}

function guidePlan(request: StartRequest, slug: string, title: string | null, t: (en: string) => string): StartPlan {
  const guide = guideBySlug(slug, request.lang) ?? guideBySlug(slug, "en")!;
  return {
    request,
    basis: { source: "guide", id: slug, label: fill(t("From the guide “{name}”, with official sources"), { name: guide.short }), href: guidePath(request.lang, slug) },
    name: title ?? guide.mission.name,
    intent: guide.mission.intent,
    headline: guide.title,
    criteria: guide.mission.criteria,
    actions: guide.mission.actions,
    licensed: false,
  };
}

/** Same query shape as a template's prefill, for "Edit before saving". */
export function editBeforeSavingHref(plan: StartPlan) {
  const params = new URLSearchParams({
    name: plan.name,
    intent: plan.intent,
    criteria: plan.criteria.join("\n"),
    actions: plan.actions.join("\n"),
  });
  return `/app/missions/new?${params.toString()}`;
}

/** A checklist's plan. Checklists are written in English for English-speaking
    buyers (lib/checklists.ts), so the plan keeps their wording in any language. */
function checklistPlan(request: StartRequest, slug: string, t: (en: string) => string): StartPlan {
  const checklist = checklistBySlug(slug)!;
  const mission = checklistMission(checklist);
  return {
    request,
    basis: { source: "checklist", id: slug, label: fill(t("From the checklist “{name}”"), { name: checklist.short }), href: checklistPath(slug) },
    name: mission.name,
    intent: mission.intent,
    headline: checklist.title,
    criteria: mission.criteria,
    actions: mission.actions,
    licensed: false,
  };
}

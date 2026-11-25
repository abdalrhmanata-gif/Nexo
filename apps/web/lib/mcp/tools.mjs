// The tools ZAVQERA offers to ChatGPT, Claude and Gemini over MCP.
//
// Each tool is one narrow job with its own annotations, as both directories
// require: reading tools are separate from writing tools, writes that change
// or end something already saved are marked destructive, and nothing reaches
// outside the person's own workspace except share_mission, which publishes a
// read-only link and says so. Inputs are validated here with messages an
// assistant can act on; the database still decides every permission, because
// every statement runs with the person's own token.
//
// The data layer is injected (`context.api`), so this file is pure and the
// tests drive it with a fake.

import { composeMissionObjective, isActionTransitionAllowed, allowedNextStatuses } from "../mission-content.mjs";
import { isPlanDate } from "../plan-dates.mjs";
import { normaliseProof } from "../step-proof.mjs";
import {
  STEP_STATUS_IN,
  STEP_STATUS_OUT,
  missionDetail,
  missionDetailText,
  missionSummary,
  missionSummaryText,
  nextSteps,
  nextStepsText,
} from "./format.mjs";

/** The scope every tool needs: the person's identity, nothing more. */
export const TOOL_SCOPES = Object.freeze(["openid"]);
const SECURITY = Object.freeze([{ type: "oauth2", scopes: [...TOOL_SCOPES] }]);

export const BOUNDS = Object.freeze({
  name: 100,
  intentMin: 12,
  intent: 3000,
  criteria: 12,
  criterion: 500,
  steps: 50,
  step: 2000,
  listLimit: 50,
  nextLimit: 25,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_OR_NONE = "^(\\d{4}-\\d{2}-\\d{2}|none)$";
const RECENT_DUPLICATE_MINUTES = 10;

class InvalidInput extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidInput";
  }
}

// ---------------------------------------------------------------- inputs --

function oneLine(value) {
  return value.replace(/\s+/g, " ").trim();
}

function requiredText(args, key, max, min = 1) {
  const value = args[key];
  if (typeof value !== "string") throw new InvalidInput(`${key} is required and must be text.`);
  const text = value.trim();
  if (text.length < min) throw new InvalidInput(min > 1 ? `${key} must be at least ${min} characters: describe it in a full sentence.` : `${key} cannot be empty.`);
  if (text.length > max) throw new InvalidInput(`${key} must be at most ${max} characters (it has ${text.length}).`);
  return text;
}

function optionalText(args, key, max) {
  if (args[key] === undefined || args[key] === null || args[key] === "") return null;
  return requiredText(args, key, max);
}

function missionId(args, key = "mission_id") {
  const value = args[key];
  if (typeof value !== "string" || !UUID.test(value.trim())) {
    throw new InvalidInput(`${key} must be a ZAVQERA id (a UUID) as returned by list_missions or get_mission.`);
  }
  return value.trim().toLowerCase();
}

function lineList(args, key, { maxItems, maxLength, required = false }) {
  const value = args[key];
  if (value === undefined || value === null) {
    if (required) throw new InvalidInput(`${key} is required: a list of short lines.`);
    return [];
  }
  if (!Array.isArray(value)) throw new InvalidInput(`${key} must be a list of text items.`);
  const items = value.map((item, index) => {
    if (typeof item !== "string") throw new InvalidInput(`${key}[${index}] must be text.`);
    const text = oneLine(item);
    if (text.length > maxLength) throw new InvalidInput(`${key}[${index}] must be at most ${maxLength} characters.`);
    return text;
  }).filter(Boolean);
  if (required && !items.length) throw new InvalidInput(`${key} needs at least one item.`);
  if (items.length > maxItems) throw new InvalidInput(`${key} can hold at most ${maxItems} items (it has ${items.length}).`);
  return items;
}

/** "YYYY-MM-DD" → the date, "none" → null (remove), absent → undefined (leave). */
function dateChange(value, key) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "none") return null;
  if (!isPlanDate(value)) throw new InvalidInput(`${key} must be a real date written YYYY-MM-DD between 2000 and 2100, or "none" to remove it.`);
  return value;
}

function limit(args, fallback, max) {
  const value = args.limit;
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) throw new InvalidInput(`limit must be a whole number from 1 to ${max}.`);
  return value;
}

/** Keeps the stored shape `name\n\nintent\n\nSuccess criteria:\n...` unambiguous. */
function safeIntent(intent) {
  return intent.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\n\s*\n(\s*Success criteria:)/gi, "\n$1");
}

// --------------------------------------------------------------- results --

function ok(text, structuredContent) {
  return { content: [{ type: "text", text }], structuredContent };
}

function refuse(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

const NOT_FOUND = "No Mission with that mission_id in this person's workspace. Call list_missions to find the right one.";

function explain(error) {
  if (!error || typeof error !== "object") return null;
  if (error.name === "InvalidInput" || error.name === "MissionMutationRejectedError") return error.message;
  if (error.name === "MissionMutationConflictError") return "This Mission changed since it was read. Call get_mission and try again.";
  if (error.name === "PlanDatesError") {
    return error.reason === "forbidden"
      ? "Only the person who created this Mission can change its dates."
      : "The dates could not be saved. Check each date is real (YYYY-MM-DD) and try again.";
  }
  if (error.code === "42501") return "This person cannot change that Mission: it belongs to a workspace where they are not the owner.";
  return null;
}

// ------------------------------------------------------------ the tools --

const stepsSchema = (description) => ({
  type: "array",
  description,
  maxItems: BOUNDS.steps,
  items: { type: "string", minLength: 1, maxLength: BOUNDS.step },
});

const missionIdSchema = { type: "string", description: "The Mission's id (mission_id): the UUID shown with each Mission in ZAVQERA's results." };
const stepIdSchema = { type: "string", description: "The step's id (step_id): the UUID shown with each step in ZAVQERA's results." };

function annotations(title, { readOnly, destructive = false, openWorld = false, idempotent = false }) {
  return { title, readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: openWorld, idempotentHint: idempotent };
}

async function datesFor(api, missions) {
  const ids = missions.map((mission) => mission.id);
  return ids.length ? api.datesFor(ids) : {};
}

async function readMission(api, id) {
  const mission = await api.getMission(id);
  if (!mission) throw new InvalidInput(NOT_FOUND);
  return mission;
}

async function detailOf(context, id, note) {
  const mission = await readMission(context.api, id);
  const dates = (await context.api.datesFor([mission.id]))[mission.id];
  const detail = missionDetail(mission, dates, context.origin, context.today);
  return ok(`${note ? `${note}\n\n` : ""}${missionDetailText(detail)}`, { mission: detail });
}

async function createFrom(context, { name, intent, criteria, steps, targetDate }) {
  const objective = composeMissionObjective({ name, intent: safeIntent(intent), criteria });
  const existing = await context.api.findRecentMission(objective, RECENT_DUPLICATE_MINUTES);
  if (existing) return detailOf(context, existing, "This Mission was already saved a moment ago, so no copy was made.");
  const created = await context.api.createMission({ objective, actions: steps });
  let note = `Saved as a new Mission with ${steps.length} step${steps.length === 1 ? "" : "s"}.`;
  if (targetDate) {
    try {
      await context.api.setTargetDate(created.id, targetDate);
    } catch {
      note += " The target date could not be saved; set it with set_dates.";
    }
  }
  return detailOf(context, created.id, note);
}

export const TOOLS = [
  {
    name: "list_missions",
    title: "List Missions",
    description: "Lists the person's Missions in ZAVQERA with progress, the next open step, the target date and how many steps are late. Use it to find a Mission's mission_id or to give an overview. Read only.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["active", "completed", "all"], description: "active (default) includes Missions that are waiting; completed shows finished ones; all shows both." },
        limit: { type: "integer", minimum: 1, maximum: BOUNDS.listLimit, description: "At most this many Missions, most recently updated first. Default 20." },
      },
      additionalProperties: false,
    },
    annotations: annotations("List Missions", { readOnly: true, idempotent: true }),
    async run(args, context) {
      const state = args.state ?? "active";
      if (!["active", "completed", "all"].includes(state)) throw new InvalidInput('state must be "active", "completed" or "all".');
      const max = limit(args, 20, BOUNDS.listLimit);
      const all = await context.api.listMissions();
      const chosen = all.filter((mission) => state === "all" || (state === "completed" ? mission.status === "COMPLETED" : mission.status !== "COMPLETED")).slice(0, max);
      const dates = await datesFor(context.api, chosen);
      const missions = chosen.map((mission) => missionSummary(mission, dates[mission.id], context.origin, context.today));
      const text = missions.length
        ? `${missions.length} Mission${missions.length === 1 ? "" : "s"} (${state}):\n${missions.map(missionSummaryText).join("\n")}`
        : state === "completed" ? "No completed Missions yet." : "No Missions yet. create_mission saves a plan as the first one.";
      return ok(text, { missions, total_in_workspace: all.length });
    },
  },
  {
    name: "get_mission",
    title: "Get a Mission",
    description: "Returns one Mission in full: its intent, success criteria, every step with its step_id, status, due date and recorded proof, and its target date. Read only.",
    inputSchema: {
      type: "object",
      properties: { mission_id: missionIdSchema },
      required: ["mission_id"],
      additionalProperties: false,
    },
    annotations: annotations("Get a Mission", { readOnly: true, idempotent: true }),
    async run(args, context) {
      return detailOf(context, missionId(args));
    },
  },
  {
    name: "get_next_steps",
    title: "Get next steps",
    description: "Answers \"what should I do next?\" across all of the person's open Missions: late steps first, then steps due within 7 days, then the next open step of each other Mission. Read only.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: BOUNDS.nextLimit, description: "At most this many steps. Default 10." },
      },
      additionalProperties: false,
    },
    annotations: annotations("Get next steps", { readOnly: true, idempotent: true }),
    async run(args, context) {
      const max = limit(args, 10, BOUNDS.nextLimit);
      const open = (await context.api.listMissions()).filter((mission) => mission.status !== "COMPLETED");
      const dates = await datesFor(context.api, open);
      const items = nextSteps(open.map((mission) => ({ mission, dates: dates[mission.id] })), context.today, { limit: max });
      return ok(nextStepsText(items), { steps: items, today: context.today });
    },
  },
  {
    name: "list_templates",
    title: "List Mission templates",
    description: "Lists ZAVQERA's ready-made Mission templates (for example launching a small project, finding growth opportunities, settling in a new country, finding a job, organising an event), each with its template_id. Read only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: annotations("List Mission templates", { readOnly: true, idempotent: true }),
    async run(_args, context) {
      const templates = context.api.templates.map((template) => ({
        template_id: template.id,
        title: template.title,
        description: template.description,
        steps: template.actions.length,
      }));
      return ok(templates.map((template) => `- ${template.title} (template_id ${template.template_id}, ${template.steps} steps): ${template.description}`).join("\n"), { templates });
    },
  },
  {
    name: "create_mission",
    title: "Create a Mission",
    description: "Saves a new Mission in the person's ZAVQERA workspace from a goal and, optionally, success criteria, ordered steps and a target date, so it can be tracked step by step with proof. Creates one Mission each call; the same Mission sent again within 10 minutes is not saved twice.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: BOUNDS.name, description: "A short name for the goal, e.g. \"Renew my passport\"." },
        intent: { type: "string", minLength: BOUNDS.intentMin, maxLength: BOUNDS.intent, description: "One or two sentences: what the person wants to achieve and why." },
        success_criteria: { type: "array", maxItems: BOUNDS.criteria, items: { type: "string", minLength: 1, maxLength: BOUNDS.criterion }, description: "Optional. How the person will know it is done, one checkable statement each." },
        steps: stepsSchema("Optional. The work in order, one short imperative step each, e.g. \"Book an appointment\"."),
        target_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Optional. When the goal should be done, YYYY-MM-DD." },
      },
      required: ["name", "intent"],
      additionalProperties: false,
    },
    annotations: annotations("Create a Mission", { readOnly: false }),
    async run(args, context) {
      const name = oneLine(requiredText(args, "name", BOUNDS.name));
      const intent = requiredText(args, "intent", BOUNDS.intent, BOUNDS.intentMin);
      const criteria = lineList(args, "success_criteria", { maxItems: BOUNDS.criteria, maxLength: BOUNDS.criterion });
      const steps = lineList(args, "steps", { maxItems: BOUNDS.steps, maxLength: BOUNDS.step });
      const targetDate = dateChange(args.target_date, "target_date");
      if (targetDate === null) throw new InvalidInput("target_date must be a date written YYYY-MM-DD.");
      return createFrom(context, { name, intent, criteria, steps, targetDate });
    },
  },
  {
    name: "create_mission_from_template",
    title: "Create a Mission from a template",
    description: "Saves a new Mission in the person's workspace from one of ZAVQERA's ready-made templates, with the template's intent, success criteria and steps. Optionally renames it and sets a target date. The same template sent again within 10 minutes is not saved twice.",
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "The template's id, for example launch-plan, find-a-job or organise-an-event." },
        name: { type: "string", minLength: 1, maxLength: BOUNDS.name, description: "Optional. A name for this Mission instead of the template's title." },
        target_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Optional. When the goal should be done, YYYY-MM-DD." },
      },
      required: ["template_id"],
      additionalProperties: false,
    },
    annotations: annotations("Create a Mission from a template", { readOnly: false }),
    async run(args, context) {
      const id = typeof args.template_id === "string" ? args.template_id.trim() : "";
      const template = context.api.templates.find((candidate) => candidate.id === id);
      if (!template) throw new InvalidInput(`Unknown template_id. Available: ${context.api.templates.map((candidate) => candidate.id).join(", ")}.`);
      const name = args.name === undefined || args.name === null || args.name === "" ? template.title : oneLine(requiredText(args, "name", BOUNDS.name));
      const targetDate = dateChange(args.target_date, "target_date");
      if (targetDate === null) throw new InvalidInput("target_date must be a date written YYYY-MM-DD.");
      return createFrom(context, { name, intent: template.intent, criteria: template.criteria, steps: template.actions, targetDate });
    },
  },
  {
    name: "add_steps",
    title: "Add steps to a Mission",
    description: "Appends new steps, in order, to the end of an existing Mission. Existing steps are not changed. Each call adds the steps again, so do not repeat a call that succeeded.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: missionIdSchema,
        steps: { ...stepsSchema("The new steps, one short imperative step each."), minItems: 1 },
      },
      required: ["mission_id", "steps"],
      additionalProperties: false,
    },
    annotations: annotations("Add steps to a Mission", { readOnly: false }),
    async run(args, context) {
      const id = missionId(args);
      const steps = lineList(args, "steps", { maxItems: BOUNDS.steps, maxLength: BOUNDS.step, required: true });
      const mission = await readMission(context.api, id);
      if (mission.status === "COMPLETED") throw new InvalidInput("This Mission is complete, so it takes no new steps. Create a new Mission for more work.");
      await context.api.addSteps(id, steps);
      return detailOf(context, id, `Added ${steps.length} step${steps.length === 1 ? "" : "s"}.`);
    },
  },
  {
    name: "complete_step",
    title: "Complete a step",
    description: "Marks one step of a Mission as done and, optionally, records its proof: a short note (such as a reference number) and/or a link. A done step cannot be reopened. If the step is already done, the proof given replaces its recorded proof.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: missionIdSchema,
        step_id: stepIdSchema,
        proof_note: { type: "string", maxLength: 1000, description: "Optional. What shows it is done, e.g. \"Appointment confirmed, reference 48213\"." },
        proof_url: { type: "string", maxLength: 2048, description: "Optional. A link to the proof, starting with https:// or http://." },
      },
      required: ["mission_id", "step_id"],
      additionalProperties: false,
    },
    annotations: annotations("Complete a step", { readOnly: false, destructive: true }),
    async run(args, context) {
      const id = missionId(args);
      const stepId = missionId(args, "step_id");
      const proof = normaliseProof({ note: args.proof_note ?? null, url: args.proof_url ?? null });
      if (!proof.ok) throw new InvalidInput(proof.error);
      const mission = await readMission(context.api, id);
      const step = mission.actions.find((action) => action.id === stepId);
      if (!step) throw new InvalidInput("That step_id is not a step of this Mission. Call get_mission to see its steps.");
      if (step.status === "CANCELLED") throw new InvalidInput("This step was cancelled, so it cannot be completed. Add a new step instead.");
      const input = { actionId: step.id, expectedVersion: step.version, evidenceNote: proof.note, evidenceUrl: proof.url, missionId: id };
      if (step.status === "COMPLETED") {
        if (!proof.note && !proof.url) return detailOf(context, id, "This step was already done; nothing changed.");
        await context.api.setStepProof(input);
        return detailOf(context, id, "The step was already done; its proof was updated.");
      }
      await context.api.completeStep(input);
      return detailOf(context, id, `Marked done: ${step.title}${proof.note || proof.url ? " (with proof)" : ""}.`);
    },
  },
  {
    name: "update_step_status",
    title: "Change a step's status",
    description: "Moves one step to not_started, in_progress, waiting (paused on something outside the person's control) or cancelled. Cancelling is final. Marking a step done is not one of these statuses. Only the moves the Mission allows are accepted; a refused move says which are allowed.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: missionIdSchema,
        step_id: stepIdSchema,
        status: { type: "string", enum: ["not_started", "in_progress", "waiting", "cancelled"], description: "The new status." },
      },
      required: ["mission_id", "step_id", "status"],
      additionalProperties: false,
    },
    annotations: annotations("Change a step's status", { readOnly: false, destructive: true }),
    async run(args, context) {
      const id = missionId(args);
      const stepId = missionId(args, "step_id");
      const target = STEP_STATUS_IN[args.status];
      if (!target || target === "COMPLETED") throw new InvalidInput('status must be "not_started", "in_progress", "waiting" or "cancelled". Use complete_step to mark a step done.');
      const mission = await readMission(context.api, id);
      const step = mission.actions.find((action) => action.id === stepId);
      if (!step) throw new InvalidInput("That step_id is not a step of this Mission. Call get_mission to see its steps.");
      if (step.status === target) return detailOf(context, id, `The step is already ${args.status}; nothing changed.`);
      if (!isActionTransitionAllowed(step.status, target)) {
        const allowed = allowedNextStatuses(step.status).map((status) => STEP_STATUS_OUT[status]).map((status) => status === "done" ? "done (with complete_step)" : status);
        throw new InvalidInput(allowed.length
          ? `A step that is ${STEP_STATUS_OUT[step.status]} can move to: ${allowed.join(", ")}.`
          : `This step is ${STEP_STATUS_OUT[step.status]}, which is final.`);
      }
      await context.api.updateStepStatus({ actionId: step.id, status: target, expectedVersion: step.version, missionId: id });
      return detailOf(context, id, `"${step.title}" is now ${args.status}.`);
    },
  },
  {
    name: "set_dates",
    title: "Set a Mission's dates",
    description: "Sets or removes a Mission's target date and the due dates of its steps. Dates are YYYY-MM-DD; \"none\" removes one. Only the Mission's creator can change its dates. Dates not mentioned stay as they are.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: missionIdSchema,
        target_date: { type: "string", pattern: DATE_OR_NONE, description: "Optional. The goal's target date, YYYY-MM-DD, or \"none\" to remove it." },
        step_due_dates: {
          type: "array",
          maxItems: BOUNDS.steps,
          description: "Optional. Due dates for individual steps.",
          items: {
            type: "object",
            properties: {
              step_id: stepIdSchema,
              due_date: { type: "string", pattern: DATE_OR_NONE, description: "YYYY-MM-DD, or \"none\" to remove the due date." },
            },
            required: ["step_id", "due_date"],
            additionalProperties: false,
          },
        },
      },
      required: ["mission_id"],
      additionalProperties: false,
    },
    annotations: annotations("Set a Mission's dates", { readOnly: false, destructive: true, idempotent: true }),
    async run(args, context) {
      const id = missionId(args);
      const target = dateChange(args.target_date, "target_date");
      const raw = args.step_due_dates ?? [];
      if (!Array.isArray(raw)) throw new InvalidInput("step_due_dates must be a list of { step_id, due_date }.");
      if (raw.length > BOUNDS.steps) throw new InvalidInput(`step_due_dates can hold at most ${BOUNDS.steps} items.`);
      if (target === undefined && !raw.length) throw new InvalidInput("Give target_date, step_due_dates or both.");
      const mission = await readMission(context.api, id);
      const changes = raw.map((entry, index) => {
        if (!entry || typeof entry !== "object") throw new InvalidInput(`step_due_dates[${index}] must be { step_id, due_date }.`);
        const stepId = missionId(entry, "step_id");
        if (!mission.actions.some((action) => action.id === stepId)) throw new InvalidInput(`step_due_dates[${index}].step_id is not a step of this Mission.`);
        const dueOn = dateChange(entry.due_date, `step_due_dates[${index}].due_date`);
        if (dueOn === undefined) throw new InvalidInput(`step_due_dates[${index}].due_date is required: YYYY-MM-DD or "none".`);
        return { actionId: stepId, dueOn, basis: null };
      });
      if (target !== undefined) await context.api.setTargetDate(id, target);
      if (changes.length) await context.api.setStepDates(id, changes);
      return detailOf(context, id, "Dates saved.");
    },
  },
  {
    name: "share_mission",
    title: "Share a Mission",
    description: "Creates or refreshes a public, read-only link to a Mission's result: its name, intent, success criteria, step titles and progress. Recorded proof is not included. Anyone with the link can open it, and the person can stop sharing on zavqera.com at any time.",
    inputSchema: {
      type: "object",
      properties: { mission_id: missionIdSchema },
      required: ["mission_id"],
      additionalProperties: false,
    },
    annotations: annotations("Share a Mission", { readOnly: false, openWorld: true, idempotent: true }),
    async run(args, context) {
      const id = missionId(args);
      const mission = await readMission(context.api, id);
      const url = await context.api.shareMission(mission);
      if (!url) return refuse("This Mission could not be shared. Only its owner can share it, and it needs a name and an intent.");
      return ok(`Anyone with this link can see "${mission.name}" (no proof is included): ${url}`, { mission_id: id, share_url: url });
    },
  },
];

for (const tool of TOOLS) {
  tool.securitySchemes = SECURITY;
}

/** What tools/list returns: the descriptors, without the code. */
export function toolDescriptors() {
  return TOOLS.map(({ name, title, description, inputSchema, annotations: hints, securitySchemes }) => ({
    name,
    title,
    description,
    inputSchema,
    annotations: hints,
    securitySchemes,
    _meta: { securitySchemes },
  }));
}

/**
 * Runs one tool. Returns null for an unknown name (a protocol error), and an
 * MCP result otherwise: a tool that refuses says why, in words the assistant
 * can act on, with isError set.
 */
export async function callTool(name, args, context) {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return null;
  try {
    return await tool.run(args ?? {}, context);
  } catch (error) {
    return refuse(explain(error) ?? "ZAVQERA could not complete this just now. Try again in a moment; the person can also open zavqera.com.");
  }
}

export { InvalidInput };

const CRITERIA_MARKER = "\n\nSuccess criteria:\n";

/**
 * Missions are persisted as a single `objective` text column. The mission
 * creation form composes that column as:
 *
 *   <name>\n\n<intent>\n\nSuccess criteria:\n<one criterion per line>
 *
 * Parsing it back is what lets the workspace and detail views present the
 * title, the intent and the success criteria as distinct information instead
 * of repeating the whole stored blob. Objectives that do not follow the
 * composed shape still produce a usable title and intent.
 */
export function parseMissionObjective(objective) {
  const text = typeof objective === "string" ? objective.trim() : "";
  if (!text) return { name: "Untitled mission", intent: "", criteria: [] };

  const markerAt = text.indexOf(CRITERIA_MARKER);
  const head = markerAt === -1 ? text : text.slice(0, markerAt);
  const criteria = markerAt === -1
    ? []
    : text.slice(markerAt + CRITERIA_MARKER.length).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const blocks = head.split(/\n\s*\n/);
  const name = (blocks[0] ?? "").trim().slice(0, 200) || "Untitled mission";
  const intent = blocks.slice(1).join("\n\n").trim();

  return { name, intent, criteria };
}

export function composeMissionObjective({ name, intent, criteria }) {
  const lines = Array.isArray(criteria) ? criteria.join("\n") : criteria ?? "";
  return `${name}\n\n${intent}${CRITERIA_MARKER}${lines}`;
}

export const MISSION_STATUS_LABELS = {
  DRAFT: "Draft",
  PLANNING: "Planning",
  READY: "Ready to start",
  RUNNING: "In progress",
  WAITING: "Waiting",
  NEEDS_USER: "Needs your input",
  VERIFYING: "Checking the evidence",
  COMPLETED: "Complete",
  PAUSED: "Paused",
  BLOCKED: "Blocked",
  FAILED: "Did not succeed",
  CANCELLED: "Cancelled",
};

// Every sentence this module produces is written in English and passed
// through `t`, which the caller supplies. The default returns the English
// unchanged, so the logic can be tested without a dictionary and a caller
// that has no language to hand still gets a correct sentence.
//
// The module used to return finished English. The mission page rendered it
// as it came, so a page whose labels were Arabic said "Start next action",
// "This work has not begun yet." and "0 complete of 3" in the middle of
// them — and no audit saw it, because the text was neither in a component
// nor wrapped in anything.
const same = (text) => text;

/** Replace {name} placeholders. Kept local so this file imports nothing. */
function fill(text, values) {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)), text);
}

export function missionStatusLabel(status, t = same) {
  return Object.hasOwn(MISSION_STATUS_LABELS, status) ? t(MISSION_STATUS_LABELS[status]) : status;
}

/**
 * Mirrors the transition table enforced by `transition_mission`. The database
 * remains authoritative; this exists so the interface never offers a mission
 * state that is guaranteed to be rejected. Keep the two in step.
 */
const ALLOWED_MISSION_TRANSITIONS = {
  DRAFT: ["PLANNING", "CANCELLED"],
  PLANNING: ["READY", "PAUSED", "BLOCKED", "CANCELLED"],
  READY: ["RUNNING", "PAUSED", "BLOCKED", "CANCELLED"],
  RUNNING: ["WAITING", "NEEDS_USER", "VERIFYING", "PAUSED", "BLOCKED", "FAILED", "CANCELLED"],
  WAITING: ["RUNNING", "NEEDS_USER", "PAUSED", "BLOCKED", "CANCELLED"],
  NEEDS_USER: ["RUNNING", "PAUSED", "BLOCKED", "CANCELLED"],
  VERIFYING: ["COMPLETED", "FAILED", "PAUSED", "BLOCKED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED"],
  BLOCKED: ["PLANNING", "READY", "RUNNING", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function allowedNextMissionStatuses(from) {
  return ALLOWED_MISSION_TRANSITIONS[from] ?? [];
}

export function isMissionTransitionAllowed(from, to) {
  return allowedNextMissionStatuses(from).includes(to);
}

export function isTerminalMissionStatus(status) {
  const next = ALLOWED_MISSION_TRANSITIONS[status];
  // An unrecognised status is not terminal. Treating it as terminal would let
  // a missing value silently close a mission that is still in flight.
  return Array.isArray(next) && next.length === 0;
}

/**
 * The shortest legal route from the mission's current state to `VERIFYING`,
 * which is the only state in which the database accepts a verification or an
 * outcome. Returns an empty array when the mission is already there, and null
 * when no route exists (a terminal mission).
 */
export function routeToVerifying(from) {
  if (from === "VERIFYING") return [];
  const queue = [[from, []]];
  const seen = new Set([from]);
  while (queue.length) {
    const [status, path] = queue.shift();
    for (const next of allowedNextMissionStatuses(status)) {
      if (seen.has(next)) continue;
      const route = [...path, next];
      if (next === "VERIFYING") return route;
      seen.add(next);
      queue.push([next, route]);
    }
  }
  return null;
}

/**
 * Explains, from persisted state alone, whether a verification can be recorded
 * right now. The database enforces both of these rules; surfacing them here
 * stops the interface from presenting a form that is certain to be rejected.
 */
export function verificationReadiness(mission, t = same) {
  const status = mission.lifecycleStatus;
  const actions = mission.actions ?? [];
  const unresolved = actions.filter((action) => action.status !== "COMPLETED" && action.status !== "CANCELLED");

  if (status === "VERIFYING") {
    return { ready: true, reason: "", nextStatus: null, unresolved };
  }
  if (isTerminalMissionStatus(status)) {
    return {
      ready: false,
      reason: fill(t("This mission is {state}, so no further evidence can be recorded."), { state: missionStatusLabel(status, t).toLowerCase() }),
      nextStatus: null,
      unresolved,
    };
  }
  const route = routeToVerifying(status);
  if (!route || !route.length) {
    return { ready: false, reason: t("This mission cannot move to checking the evidence from its current state."), nextStatus: null, unresolved };
  }
  return {
    ready: false,
    reason: route.length === 1
      ? t("Move this mission to checking the evidence before recording verification.")
      : fill(t("This mission is {state}. It moves to checking the evidence through {route}."), {
        state: missionStatusLabel(status, t).toLowerCase(),
        // An arrow, not .map(missionStatusLabel): map would pass the index as
        // the translator.
        route: route.slice(0, -1).map((step) => missionStatusLabel(step, t)).join(t(", then ")),
      }),
    nextStatus: route[0],
    unresolved,
  };
}

export const ACTION_STATUS_LABELS = {
  PENDING: "Not started",
  RUNNING: "In progress",
  COMPLETED: "Complete",
  BLOCKED: "Waiting",
  CANCELLED: "Cancelled",
};

export const ACTION_STATUS_HINTS = {
  PENDING: "This work has not begun yet.",
  RUNNING: "This work is underway now.",
  COMPLETED: "This work is finished.",
  BLOCKED: "Paused until something outside this action unblocks it. This is not complete.",
  CANCELLED: "This work will not be done.",
};

export function actionStatusLabel(status, t = same) {
  return Object.hasOwn(ACTION_STATUS_LABELS, status) ? t(ACTION_STATUS_LABELS[status]) : status;
}

export function actionStatusHint(status, t = same) {
  return Object.hasOwn(ACTION_STATUS_HINTS, status) ? t(ACTION_STATUS_HINTS[status]) : "";
}

export const ACTION_STATUS_ORDER = ["PENDING", "RUNNING", "BLOCKED", "COMPLETED", "CANCELLED"];

/**
 * Mirrors the transition table enforced by `transition_mission_action`. The
 * database remains authoritative; this exists so the interface does not offer
 * a choice that is guaranteed to be rejected. Keep the two in step.
 */
const ALLOWED_ACTION_TRANSITIONS = {
  PENDING: ["RUNNING", "BLOCKED", "CANCELLED"],
  RUNNING: ["COMPLETED", "BLOCKED", "CANCELLED"],
  BLOCKED: ["RUNNING", "PENDING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedNextStatuses(from) {
  return ALLOWED_ACTION_TRANSITIONS[from] ?? [];
}

export function isActionTransitionAllowed(from, to) {
  if (from === to) return from === "BLOCKED";
  return allowedNextStatuses(from).includes(to);
}

export function isTerminalActionStatus(status) {
  return allowedNextStatuses(status).length === 0;
}

/**
 * A follow-up date only exists while an action is Waiting. Every other status
 * clears it, so the interface must never offer the field elsewhere.
 */
export function supportsFollowUp(status) {
  return status === "BLOCKED";
}

/**
 * `locale` is the reader's language tag. Without it the date is formatted in
 * whatever locale the server happens to run in, which is how a Norwegian
 * reader was shown an American month-first date.
 */
export function formatFollowUp(value, now = new Date(), t = same, locale = undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const date0 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const now0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((date0 - now0) / 86400000);
  const absolute = date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  if (days < 0) {
    return { absolute, relative: days === -1 ? t("yesterday") : fill(t("{days} days ago"), { days: Math.abs(days) }), overdue: true };
  }
  if (days === 0) return { absolute, relative: t("today"), overdue: false };
  if (days === 1) return { absolute, relative: t("tomorrow"), overdue: false };
  return { absolute, relative: fill(t("in {days} days"), { days }), overdue: false };
}

/** Converts a stored timestamp into the value a `date` input expects. */
export function followUpInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Deterministically describes the single next step for a mission using only
 * persisted data. There is no inference or recommendation here: each branch
 * reports a fact that is already true of the mission.
 */
export function nextStepFor(mission, t = same, locale = undefined) {
  const followUp = (value) => formatFollowUp(value, new Date(), t, locale);
  const actions = mission.actions ?? [];
  const outcomes = mission.outcomes ?? [];
  const verifications = mission.verifications ?? [];
  const lifecycle = mission.lifecycleStatus;

  // The workspace list loads actions but not verification or outcome history,
  // so lifecycle state is the only reliable signal there that a mission is
  // finished. Without this, a completed mission still asks for verification.
  if (isTerminalMissionStatus(lifecycle)) {
    if (lifecycle === "COMPLETED") {
      return { label: t("Complete"), detail: t("This mission reached its stated outcome."), tone: "done" };
    }
    return { label: missionStatusLabel(lifecycle, t), detail: t("This mission is closed. No further work is expected."), tone: "done" };
  }

  if (outcomes.length) {
    return { label: t("Outcome recorded"), detail: t("This mission has a verified outcome."), tone: "done" };
  }
  const blocked = actions.filter((action) => action.status === "BLOCKED");
  const dated = blocked
    .filter((action) => action.followUpAt)
    .sort((a, b) => new Date(a.followUpAt).getTime() - new Date(b.followUpAt).getTime());
  const due = dated.find((action) => followUp(action.followUpAt)?.overdue);
  if (due) {
    return { label: t("Follow-up due"), detail: fill(t("{title} — due {when}"), { title: due.title, when: followUp(due.followUpAt).relative }), tone: "attention" };
  }
  const running = actions.find((action) => action.status === "RUNNING");
  if (running) {
    return { label: t("In progress"), detail: running.title, tone: "info" };
  }

  const pending = actions.find((action) => action.status === "PENDING");
  if (pending) {
    return { label: t("Start next action"), detail: pending.title, tone: "info" };
  }

  if (blocked.length) {
    const next = dated[0];
    if (next) {
      return { label: t("Waiting"), detail: fill(t("{title} — check back {when}"), { title: next.title, when: followUp(next.followUpAt).relative }), tone: "info" };
    }
    return { label: t("Waiting on you"), detail: blocked[0].title, tone: "attention" };
  }

  if (!actions.length) {
    return { label: t("No actions yet"), detail: t("Add the work this mission needs."), tone: "attention" };
  }

  if (lifecycle !== "VERIFYING") {
    return {
      label: t("Ready to check"),
      detail: t("Every action is resolved. Move this mission to checking the evidence."),
      tone: "attention",
    };
  }
  if (verifications.some((verification) => verification.status === "VERIFIED")) {
    return { label: t("Commit the verified outcome"), detail: t("Passing verification is recorded but no outcome has been committed."), tone: "attention" };
  }
  return { label: t("Record verification"), detail: t("Every action is resolved. Record the evidence that proves the outcome."), tone: "attention" };
}

/**
 * Mission event payloads are internal. Only a short, human-readable summary of
 * known-safe scalar fields is surfaced, so the activity feed never renders a
 * raw JSON dump of server state.
 */
const EVENT_SUMMARY_FIELDS = ["from_status", "to_status", "status", "title", "reason"];

export function summariseEventPayload(payload) {
  if (!payload || typeof payload !== "object") return "Mission history event";
  const parts = [];
  if (typeof payload.from_status === "string" && typeof payload.to_status === "string") {
    parts.push(`${payload.from_status} to ${payload.to_status}`);
  } else {
    for (const field of EVENT_SUMMARY_FIELDS) {
      const value = payload[field];
      if (typeof value === "string" && value.trim()) parts.push(value.trim());
    }
  }
  if (!parts.length) return "Mission history event";
  return parts.join(" · ").slice(0, 160);
}

export function humaniseEventType(eventType) {
  if (typeof eventType !== "string" || !eventType.trim()) return "Mission event";
  const words = eventType.replaceAll("_", " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

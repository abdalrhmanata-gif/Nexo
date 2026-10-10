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

const MISSION_STATUS_LABELS = {
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

export function missionStatusLabel(status) {
  return MISSION_STATUS_LABELS[status] ?? status;
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
export function verificationReadiness(mission) {
  const status = mission.lifecycleStatus;
  const actions = mission.actions ?? [];
  const unresolved = actions.filter((action) => action.status !== "COMPLETED" && action.status !== "CANCELLED");

  if (status === "VERIFYING") {
    return { ready: true, reason: "", nextStatus: null, unresolved };
  }
  if (isTerminalMissionStatus(status)) {
    return {
      ready: false,
      reason: `This mission is ${missionStatusLabel(status).toLowerCase()}, so no further evidence can be recorded.`,
      nextStatus: null,
      unresolved,
    };
  }
  const route = routeToVerifying(status);
  if (!route || !route.length) {
    return { ready: false, reason: "This mission cannot move to checking the evidence from its current state.", nextStatus: null, unresolved };
  }
  return {
    ready: false,
    reason: route.length === 1
      ? "Move this mission to checking the evidence before recording verification."
      : `This mission is ${missionStatusLabel(status).toLowerCase()}. It moves to checking the evidence through ${route.slice(0, -1).map(missionStatusLabel).join(", then ")}.`,
    nextStatus: route[0],
    unresolved,
  };
}

const ACTION_STATUS_LABELS = {
  PENDING: "Not started",
  RUNNING: "In progress",
  COMPLETED: "Complete",
  BLOCKED: "Waiting",
  CANCELLED: "Cancelled",
};

const ACTION_STATUS_HINTS = {
  PENDING: "This work has not begun yet.",
  RUNNING: "This work is underway now.",
  COMPLETED: "This work is finished.",
  BLOCKED: "Paused until something outside this action unblocks it. This is not complete.",
  CANCELLED: "This work will not be done.",
};

export function actionStatusLabel(status) {
  return ACTION_STATUS_LABELS[status] ?? status;
}

export function actionStatusHint(status) {
  return ACTION_STATUS_HINTS[status] ?? "";
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

export function formatFollowUp(value, now = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const date0 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const now0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((date0 - now0) / 86400000);
  const absolute = formatDateOnly(value);
  if (days < 0) return { absolute, relative: days === -1 ? "yesterday" : `${Math.abs(days)} days ago`, overdue: true };
  if (days === 0) return { absolute, relative: "today", overdue: false };
  if (days === 1) return { absolute, relative: "tomorrow", overdue: false };
  return { absolute, relative: `in ${days} days`, overdue: false };
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
export function nextStepFor(mission) {
  const actions = mission.actions ?? [];
  const outcomes = mission.outcomes ?? [];
  const verifications = mission.verifications ?? [];
  const lifecycle = mission.lifecycleStatus;

  // The workspace list loads actions but not verification or outcome history,
  // so lifecycle state is the only reliable signal there that a mission is
  // finished. Without this, a completed mission still asks for verification.
  if (isTerminalMissionStatus(lifecycle)) {
    if (lifecycle === "COMPLETED") {
      return { label: "Complete", detail: "This mission reached its stated outcome.", tone: "done" };
    }
    return { label: missionStatusLabel(lifecycle), detail: "This mission is closed. No further work is expected.", tone: "done" };
  }

  if (outcomes.length) {
    return { label: "Outcome recorded", detail: "This mission has a verified outcome.", tone: "done" };
  }
  const blocked = actions.filter((action) => action.status === "BLOCKED");
  const dated = blocked
    .filter((action) => action.followUpAt)
    .sort((a, b) => new Date(a.followUpAt).getTime() - new Date(b.followUpAt).getTime());
  const due = dated.find((action) => formatFollowUp(action.followUpAt)?.overdue);
  if (due) {
    return { label: "Follow-up due", detail: `${due.title} — due ${formatFollowUp(due.followUpAt).relative}`, tone: "attention" };
  }
  const running = actions.find((action) => action.status === "RUNNING");
  if (running) {
    return { label: "In progress", detail: running.title, tone: "info" };
  }

  const pending = actions.find((action) => action.status === "PENDING");
  if (pending) {
    return { label: "Start next action", detail: pending.title, tone: "info" };
  }

  if (blocked.length) {
    const next = dated[0];
    if (next) {
      return { label: "Waiting", detail: `${next.title} — check back ${formatFollowUp(next.followUpAt).relative}`, tone: "info" };
    }
    return { label: "Waiting on you", detail: blocked[0].title, tone: "attention" };
  }

  if (!actions.length) {
    return { label: "No actions yet", detail: "Add the work this mission needs.", tone: "attention" };
  }

  if (lifecycle !== "VERIFYING") {
    return {
      label: "Ready to check",
      detail: "Every action is resolved. Move this mission to checking the evidence.",
      tone: "attention",
    };
  }
  if (verifications.some((verification) => verification.status === "VERIFIED")) {
    return { label: "Commit the verified outcome", detail: "Passing verification is recorded but no outcome has been committed.", tone: "attention" };
  }
  return { label: "Record verification", detail: "Every action is resolved. Record the evidence that proves the outcome.", tone: "attention" };
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

export function formatDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${day}/${month}/${year}, ${time}`;
}

const EVENT_LABELS = {
  APPROVAL_REQUESTED: "Approval requested",
  APPROVAL_DECIDED: "Approval decision",
  AGENT_EXECUTION_STARTED: "Agent execution started",
  AGENT_EXECUTION_COMPLETED: "Agent execution completed",
  AGENT_EXECUTION_CANCEL_REQUESTED: "Agent cancellation requested",
  AGENT_EXECUTION_RECONCILED: "Execution reconciled",
  AGENT_EXECUTION_RETRY_STARTED: "Execution retry started",
  VERIFICATION_RECORDED: "Verification recorded",
  OUTCOME_COMMITTED: "Outcome committed",
  WORKSPACE_INVITATION_CREATED: "Invitation created",
  WORKSPACE_INVITATION_ACCEPTED: "Invitation accepted",
  WORKSPACE_INVITATION_REVOKED: "Invitation revoked",
  MEMBER_ROLE_CHANGED: "Member role changed",
  MEMBER_REMOVED: "Member removed",
};

export function humaniseEventType(eventType) {
  if (typeof eventType !== "string" || !eventType.trim()) return "Mission event";
  return EVENT_LABELS[eventType] ?? (() => {
    const words = eventType.replaceAll("_", " ").trim().toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  })();
}


/**
 * Presents only allowlisted approval-scope fields. Never stringify the raw
 * scope because it can contain internal identifiers or future sensitive data.
 */
const APPROVAL_SCOPE_FIELDS = [
  ["type", "Request type", "text"],
  ["destination", "Destination", "text"],
  ["audience", "Audience", "text"],
  ["bounded_action", "Bounded action", "boolean"],
  ["reason", "Reason", "text"],
  ["purpose", "Purpose", "text"],
  ["requested_action", "Requested action", "text"],
  ["action", "Requested action", "text"],
  ["effect", "Potential effect", "text"],
  ["resource", "Resource", "text"],
  ["data_scope", "Data scope", "text"],
  ["allowed_actions", "Allowed actions", "list"],
  ["not_allowed_actions", "Not allowed", "list"],
  ["forbidden_actions", "Forbidden actions", "list"],
  ["read_only", "Read-only", "boolean"],
  ["external_side_effects", "External side effects", "boolean"],
  ["requires_approval", "Requires approval", "boolean"],
  ["budget", "Budget", "scalar"],
  ["max_items", "Maximum items", "scalar"],
  ["expires_at", "Expiry", "scalar"],
  ["description", "Description", "text"],
];

function approvalScopeValue(value, kind) {
  if (kind === "boolean" && typeof value === "boolean") return value ? "Yes" : "No";
  if ((kind === "text" || kind === "scalar") && (typeof value === "string" || typeof value === "number")) {
    const text = String(value).trim();
    return text ? text.slice(0, 100) : "";
  }
  if (kind === "list" && Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(", ")
      .slice(0, 100);
  }
  return "";
}

export function summariseApprovalScope(scope) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    return "No readable scope details were provided; inspect the mission before deciding.";
  }
  const parts = [];
  for (const [field, label, kind] of APPROVAL_SCOPE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(scope, field)) continue;
    const value = approvalScopeValue(scope[field], kind);
    if (value) parts.push(`${label}: ${value}`);
    if (parts.length >= 5) break;
  }
  return parts.length
    ? parts.join(" · ").slice(0, 360)
    : "No readable scope details were provided; inspect the mission before deciding.";
}

// What the MCP tools return: the person's Missions as small, stable records
// for the assistant (structuredContent) and the same facts as short text
// (content), with every id the next call needs. Pure, so it is tested
// without a database.

import { daysBetween } from "../plan-dates.mjs";

/** Step statuses as the assistant sees them, and as the database stores them. */
export const STEP_STATUS_OUT = Object.freeze({
  PENDING: "not_started",
  RUNNING: "in_progress",
  BLOCKED: "waiting",
  COMPLETED: "done",
  CANCELLED: "cancelled",
});

export const STEP_STATUS_IN = Object.freeze({
  not_started: "PENDING",
  in_progress: "RUNNING",
  waiting: "BLOCKED",
  done: "COMPLETED",
  cancelled: "CANCELLED",
});

const OPEN = new Set(["PENDING", "RUNNING", "BLOCKED"]);
const EMPTY_DATES = Object.freeze({ targetDate: null, dueDates: {} });

export function missionUrl(origin, missionId) {
  return `${origin}/app/missions/${missionId}`;
}

function missionState(mission) {
  if (mission.status === "COMPLETED") return "completed";
  if (mission.status === "WAITING") return "waiting";
  return "active";
}

export function stepView(action, dates = EMPTY_DATES) {
  const due = dates.dueDates?.[action.id];
  return {
    step_id: action.id,
    title: action.title,
    status: STEP_STATUS_OUT[action.status] ?? "not_started",
    due_date: due?.dueOn ?? null,
    due_set_by_law: due?.basis === "law",
    proof_note: action.evidenceNote ?? null,
    proof_url: action.evidenceUrl ?? null,
  };
}

function lateSteps(mission, dates, today) {
  return mission.actions.filter((action) => {
    const due = dates.dueDates?.[action.id];
    return OPEN.has(action.status) && due && due.dueOn < today;
  });
}

function firstOpenStep(mission) {
  return mission.actions.find((action) => action.status === "RUNNING")
    ?? mission.actions.find((action) => action.status === "PENDING")
    ?? mission.actions.find((action) => action.status === "BLOCKED")
    ?? null;
}

export function missionSummary(mission, dates = EMPTY_DATES, origin, today) {
  const next = firstOpenStep(mission);
  const target = dates.targetDate ?? null;
  return {
    mission_id: mission.id,
    name: mission.name,
    state: missionState(mission),
    progress_percent: mission.progress,
    steps_done: mission.actionsCompleted,
    steps_total: mission.actionsTotal,
    next_step: next ? { step_id: next.id, title: next.title, status: STEP_STATUS_OUT[next.status] } : null,
    target_date: target,
    days_left: target ? daysBetween(today, target) : null,
    late_steps: lateSteps(mission, dates, today).length,
    url: missionUrl(origin, mission.id),
  };
}

export function missionDetail(mission, dates = EMPTY_DATES, origin, today) {
  const outcome = mission.outcomes?.[0];
  return {
    ...missionSummary(mission, dates, origin, today),
    intent: mission.intent,
    success_criteria: mission.criteria ?? [],
    steps: mission.actions.map((action) => stepView(action, dates)),
    outcome: outcome ? { status: outcome.status === "COMPLETED" ? "completed" : "failed", recorded_at: outcome.createdAt } : null,
  };
}

/**
 * What to do next across every open Mission: late steps first (oldest due
 * date first), then steps due within `soonDays`, then each remaining
 * Mission's next open step. One entry per step.
 */
export function nextSteps(entries, today, { limit = 10, soonDays = 7 } = {}) {
  const late = [];
  const soon = [];
  const next = [];
  const seen = new Set();
  for (const { mission, dates = EMPTY_DATES } of entries) {
    if (mission.status === "COMPLETED") continue;
    let hasDated = false;
    for (const action of mission.actions) {
      if (!OPEN.has(action.status)) continue;
      const due = dates.dueDates?.[action.id];
      if (!due) continue;
      const days = daysBetween(today, due.dueOn);
      const item = {
        mission_id: mission.id,
        mission_name: mission.name,
        step_id: action.id,
        title: action.title,
        status: STEP_STATUS_OUT[action.status],
        due_date: due.dueOn,
        due_set_by_law: due.basis === "law",
        days_until_due: days,
      };
      if (days < 0) { late.push({ ...item, reason: "late" }); hasDated = true; seen.add(action.id); }
      else if (days <= soonDays) { soon.push({ ...item, reason: "due_soon" }); hasDated = true; seen.add(action.id); }
    }
    const open = firstOpenStep(mission);
    if (open && !seen.has(open.id) && !hasDated) {
      next.push({
        mission_id: mission.id,
        mission_name: mission.name,
        step_id: open.id,
        title: open.title,
        status: STEP_STATUS_OUT[open.status],
        due_date: dates.dueDates?.[open.id]?.dueOn ?? null,
        due_set_by_law: dates.dueDates?.[open.id]?.basis === "law",
        days_until_due: dates.dueDates?.[open.id] ? daysBetween(today, dates.dueDates[open.id].dueOn) : null,
        reason: "next",
      });
    }
  }
  late.sort((a, b) => a.due_date.localeCompare(b.due_date));
  soon.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return [...late, ...soon, ...next].slice(0, limit);
}

const STATUS_WORD = { not_started: "not started", in_progress: "in progress", waiting: "waiting", done: "done", cancelled: "cancelled" };

function dueText(date, days, byLaw) {
  if (!date) return "";
  const when = days === null || days === undefined ? date
    : days < 0 ? `${date}, ${-days} day${days === -1 ? "" : "s"} late`
      : days === 0 ? `${date}, due today`
        : `${date}, in ${days} day${days === 1 ? "" : "s"}`;
  return ` · due ${when}${byLaw ? " (deadline set by law)" : ""}`;
}

export function missionSummaryText(summary) {
  const parts = [`${summary.name} (mission_id ${summary.mission_id}): ${summary.state}, ${summary.steps_done} of ${summary.steps_total} steps done (${summary.progress_percent}%)`];
  if (summary.target_date) parts.push(`target ${summary.target_date}${summary.days_left === null ? "" : summary.days_left < 0 ? `, ${-summary.days_left} days past` : `, ${summary.days_left} days left`}`);
  if (summary.late_steps) parts.push(`${summary.late_steps} late step${summary.late_steps === 1 ? "" : "s"}`);
  if (summary.next_step) parts.push(`next: ${summary.next_step.title}`);
  return `- ${parts.join(" · ")}\n  ${summary.url}`;
}

export function missionDetailText(detail) {
  const lines = [
    `Mission: ${detail.name}`,
    `mission_id: ${detail.mission_id}`,
    `State: ${detail.state}, ${detail.steps_done} of ${detail.steps_total} steps done (${detail.progress_percent}%)`,
  ];
  if (detail.intent) lines.push(`Intent: ${detail.intent}`);
  if (detail.target_date) lines.push(`Target date: ${detail.target_date}${detail.days_left === null ? "" : ` (${detail.days_left < 0 ? `${-detail.days_left} days past` : `${detail.days_left} days left`})`}`);
  if (detail.success_criteria.length) lines.push("Success criteria:", ...detail.success_criteria.map((criterion) => `- ${criterion}`));
  lines.push(detail.steps.length ? "Steps:" : "Steps: none yet");
  detail.steps.forEach((step, index) => {
    const proof = step.proof_note || step.proof_url ? ` · proof: ${[step.proof_note, step.proof_url].filter(Boolean).join(" ")}` : "";
    lines.push(`${index + 1}. [${STATUS_WORD[step.status]}] ${step.title} (step_id ${step.step_id})${dueText(step.due_date, null, step.due_set_by_law)}${proof}`);
  });
  if (detail.outcome) lines.push(`Outcome recorded: ${detail.outcome.status}`);
  lines.push(`Open in ZAVQERA: ${detail.url}`);
  return lines.join("\n");
}

export function nextStepsText(items) {
  if (!items.length) return "Nothing is waiting: there are no open steps in any active Mission.";
  const label = { late: "Late", due_soon: "Due soon", next: "Next" };
  return items.map((item) => `- ${label[item.reason]}: ${item.title} (${item.mission_name}; mission_id ${item.mission_id}, step_id ${item.step_id})${dueText(item.due_date, item.days_until_due, item.due_set_by_law)}`).join("\n");
}

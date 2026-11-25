// Step owners: who on the team is responsible for each step.
//
// The database decides everything (who may be named, who may change it); this
// module only reads its answer and words it for the page. Kept as .mjs so the
// unit tests run it directly on the Node version Netlify builds with.

const OPEN = new Set(["PENDING", "RUNNING", "BLOCKED"]);

/** Steps that can still take an owner: not done and not cancelled. */
export function stepTakesOwner(status) {
  return OPEN.has(status);
}

/**
 * The database's answer from mission_step_owners, checked and shaped.
 * Anything unexpected reads as "no owners", never as an error: owners are an
 * addition to the page, not something it depends on.
 */
export function parseStepOwners(payload, youId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const editors = Array.isArray(payload.editors)
    ? payload.editors
      .filter((row) => row && typeof row.user_id === "string")
      .map((row) => ({ id: row.user_id, email: typeof row.email === "string" ? row.email : "", isYou: row.user_id === youId }))
    : [];
  const owners = {};
  if (payload.owners && typeof payload.owners === "object" && !Array.isArray(payload.owners)) {
    for (const [actionId, userId] of Object.entries(payload.owners)) {
      if (typeof userId === "string") owners[actionId] = userId;
    }
  }
  return { canAssign: payload.can_assign === true, editors, owners };
}

/**
 * Whether naming owners means anything here. With one editor every step is
 * theirs, so the page shows an invitation to bring the team in instead.
 */
export function ownersInUse(stepOwners) {
  return Boolean(stepOwners && stepOwners.editors.length >= 2);
}

/** How a person is named next to a step: "You", or the part of their email before the @. */
export function ownerName(editor, t = (text) => text) {
  if (!editor) return "";
  if (editor.isYou) return t("You");
  const local = editor.email.split("@")[0];
  return local || editor.email || t("A team member");
}

/** The editor who owns this step, if any and if they are still an editor. */
export function ownerOf(stepOwners, actionId) {
  if (!stepOwners) return null;
  const userId = stepOwners.owners[actionId];
  if (!userId) return null;
  return stepOwners.editors.find((editor) => editor.id === userId) ?? null;
}

/**
 * Open steps assigned to the reader, split into those in the workspace the
 * app is showing (which can be opened from here) and the number elsewhere
 * (which need the workspace switched on the Team page first).
 */
export function assignedToYou(rows, visibleMissionIds) {
  const visible = new Set(visibleMissionIds);
  const here = [];
  let elsewhere = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !stepTakesOwner(row.status)) continue;
    if (visible.has(row.missionId)) here.push(row);
    else elsewhere += 1;
  }
  return { here, elsewhere };
}

/** Why the database refused an owner change, as a sentence for the person. */
export function ownerRefusal(message = "") {
  if (message.includes("STALE_VERSION")) return "This step changed while you were looking. The page has the latest version now; try again.";
  if (message.includes("ASSIGNEE_MUST_BE_EDITOR")) return "Only someone who can edit this workspace can own a step.";
  if (message.includes("ASSIGNEE_REQUIRES_OPEN_STEP")) return "A finished step keeps its owner.";
  if (message.includes("FORBIDDEN") || message.includes("42501")) return "You can view this mission but not change it.";
  return "The owner could not be saved. Try again.";
}

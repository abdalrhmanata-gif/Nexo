// The email someone gets when a teammate gives them a step: the pure part.
//
// Sent by the owner route after the database has accepted the change, only
// when the step goes to someone other than the person making the change, and
// at most once a day per step and person (the idempotency key). It goes to an
// editor of the workspace, whose address the database returned; never to an
// address typed into a form.

const MAX_TITLE = 90;

function oneLine(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Whether this change should tell anyone: a real person, and not yourself. */
export function shouldEmailStepOwner({ assigneeId, actorId }) {
  return typeof assigneeId === "string" && assigneeId.length > 0 && assigneeId !== actorId;
}

/** One email per step and person per day, however often the choice is changed back and forth. */
export function stepOwnerIdempotencyKey(actionId, assigneeId) {
  return `step-owner-${actionId}-${assigneeId}`;
}

export function stepOwnerLink(origin, missionId) {
  return `${String(origin).replace(/\/+$/, "")}/app/open/${encodeURIComponent(missionId)}`;
}

export function stepOwnerEmail({ assignerEmail, stepTitle, missionName, link }) {
  const title = oneLine(stepTitle, MAX_TITLE) || "A step";
  const mission = oneLine(missionName, 140);
  const who = oneLine(assignerEmail, 120) || "A teammate";
  const subject = oneLine(`${who} gave you a step: ${title}`, 140);
  const text = [
    `${who} gave you a step in ZAVQERA.`,
    "",
    `Step: ${title}`,
    ...(mission ? [`Mission: ${mission}`] : []),
    "",
    `Open it: ${link}`,
    "",
    "When it is done, mark it done there and keep the proof: a receipt, a reference number or a link.",
    "",
    "You get this email because you are a member of a ZAVQERA workspace.",
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;color:#1a1a1a;line-height:1.5">
  <p style="font-size:18px;font-weight:bold;letter-spacing:2px;margin:0 0 24px">ZAVQERA</p>
  <p>${escapeHtml(who)} gave you a step in ZAVQERA.</p>
  <p style="margin:18px 0 4px;font-size:17px;font-weight:bold">${escapeHtml(title)}</p>
  ${mission ? `<p style="margin:0;color:#555">${escapeHtml(mission)}</p>` : ""}
  <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#1a1a1a;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">Open the step</a></p>
  <p style="font-size:14px">When it is done, mark it done there and keep the proof: a receipt, a reference number or a link.</p>
  <p style="font-size:13px;color:#666">You get this email because you are a member of a ZAVQERA workspace.</p>
</div>`;
  return { subject, text, html };
}

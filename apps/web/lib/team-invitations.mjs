import { createHash, randomBytes } from "node:crypto";

// Team invitations: the pure part.
//
// The database already owns the rules — who may invite, who may accept, what
// a role allows — in create/get/accept/revoke_workspace_invitation. It stores
// only a SHA-256 of the invitation token. This module makes the token, hashes
// it, and decides what a person reads; it never decides who is allowed.

export const INVITATION_TTL_DAYS = 7;
/** Open invitations per workspace. Each one is an email from our domain. */
export const MAX_PENDING_INVITATIONS = 10;
/**
 * Roles offered when inviting. The database also accepts "admin"; an admin
 * can invite others, and invitations nobody approved are not something a
 * first team feature should allow.
 */
export const INVITE_ROLES = Object.freeze(["member", "viewer"]);

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function hashInvitationToken(token) {
  if (typeof token !== "string" || !TOKEN_SHAPE.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export function newInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function invitationExpiry(now = Date.now()) {
  return new Date(now + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function invitationLink(origin, token) {
  return `${String(origin).replace(/\/+$/, "")}/invite/${token}`;
}

export function normaliseInviteEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  // The same shape the database checks, plus no angle brackets: the address
  // is shown back in pages and in the email.
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return email;
}

const INVITE_ERRORS = Object.freeze({
  USER_ALREADY_MEMBER: "That person is already in your workspace.",
  INVITATION_ALREADY_PENDING: "An invitation to that address is already waiting.",
  INVALID_INVITATION_EMAIL: "Enter a valid email address.",
  WORKSPACE_ADMIN_REQUIRED: "Only the workspace owner can invite people.",
  PENDING_LIMIT: "You have 10 invitations waiting. Revoke one before sending another.",
});
export const INVITE_ERROR_FALLBACK = "The invitation could not be created. Try again.";

const ACCEPT_ERRORS = Object.freeze({
  INVITATION_EMAIL_MISMATCH: "This invitation was sent to a different email address. Sign in with that address to accept it.",
  INVITATION_EXPIRED: "This invitation has expired. Ask for a new one.",
  INVITATION_NOT_PENDING: "This invitation has already been used or was revoked.",
  INVITATION_NOT_FOUND: "This invitation link is not valid.",
  USER_ALREADY_MEMBER: "You are already in this workspace.",
});
export const ACCEPT_ERROR_FALLBACK = "The invitation could not be accepted. Try again.";

/** The database raises its reason as the exception message; find a known one. */
function knownCode(table, message) {
  if (typeof message !== "string") return null;
  return Object.keys(table).find((code) => message.includes(code)) ?? null;
}

export function inviteErrorMessage(message) {
  const code = knownCode(INVITE_ERRORS, message);
  return code ? INVITE_ERRORS[code] : INVITE_ERROR_FALLBACK;
}

export function acceptErrorMessage(message) {
  const code = knownCode(ACCEPT_ERRORS, message);
  return code ? ACCEPT_ERRORS[code] : ACCEPT_ERROR_FALLBACK;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The invitation email. English, like the account emails. It names who sent
 * it, because an invitation from an unnamed sender reads as phishing, and it
 * carries one link.
 */
export function invitationEmail({ inviterEmail, link, role }) {
  const access = role === "viewer" ? "can view the missions in it" : "can view and edit the missions in it";
  const subject = "You are invited to a ZAVQERA workspace";
  const text = [
    `${inviterEmail} invited you to their workspace in ZAVQERA. You ${access}.`,
    "",
    `Accept the invitation: ${link}`,
    "",
    `The invitation expires in ${INVITATION_TTL_DAYS} days. If you did not expect it, you can ignore this email.`,
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;color:#1a1a1a;line-height:1.5">
  <p style="font-size:18px;font-weight:bold;letter-spacing:2px;margin:0 0 24px">ZAVQERA</p>
  <p>${escapeHtml(inviterEmail)} invited you to their workspace in ZAVQERA. You ${access}.</p>
  <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#1a1a1a;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">Accept invitation</a></p>
  <p style="font-size:13px;color:#666">The invitation expires in ${INVITATION_TTL_DAYS} days. If you did not expect it, you can ignore this email.</p>
</div>`;
  return { subject, text, html };
}

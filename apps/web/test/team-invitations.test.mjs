import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  INVITE_ROLES,
  INVITATION_TTL_DAYS,
  MAX_PENDING_INVITATIONS,
  acceptErrorMessage,
  hashInvitationToken,
  inviteErrorMessage,
  invitationEmail,
  invitationExpiry,
  invitationLink,
  newInvitationToken,
  normaliseInviteEmail,
} from "../lib/team-invitations.mjs";

// The database stores only a SHA-256 of the invitation token and checks the
// format of that hash. The token itself exists in the email and in the link,
// nowhere else.

test("a new token is long, URL-safe, and only its hash is meant for storage", () => {
  const first = newInvitationToken();
  const second = newInvitationToken();
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/, "32 random bytes, base64url");
  assert.notEqual(first.token, second.token);
  assert.match(first.tokenHash, /^[0-9a-f]{64}$/, "the database rejects anything else");
  assert.equal(first.tokenHash, createHash("sha256").update(first.token).digest("hex"));
});

test("a token from a link is hashed only if it has the shape we issue", () => {
  const { token, tokenHash } = newInvitationToken();
  assert.equal(hashInvitationToken(token), tokenHash);
  for (const bad of ["", "short", `${token}x`, "a".repeat(42) + "!", null, undefined, 42, "../../etc/passwd"]) {
    assert.equal(hashInvitationToken(bad), null, String(bad));
  }
});

test("an invitation lasts seven days", () => {
  const now = Date.UTC(2026, 10, 15, 12, 0, 0);
  assert.equal(INVITATION_TTL_DAYS, 7);
  assert.equal(invitationExpiry(now), "2026-11-22T12:00:00.000Z");
});

test("the link points at the invite page on the site the request came from", () => {
  assert.equal(invitationLink("https://zavqera.com", "abc_DEF-123"), "https://zavqera.com/invite/abc_DEF-123");
  assert.equal(invitationLink("https://zavqera.com/", "t"), "https://zavqera.com/invite/t");
});

test("an email address is trimmed and lower-cased, and a malformed one is refused", () => {
  assert.equal(normaliseInviteEmail("  Colleague@Example.COM "), "colleague@example.com");
  for (const bad of ["", "no-at-sign", "a@b", "a b@c.d", "<x>@y.z", null, 7, "x".repeat(250) + "@example.com"]) {
    assert.equal(normaliseInviteEmail(bad), null, String(bad));
  }
});

test("only roles that cannot manage the team can be given by invitation", () => {
  // The database also accepts admin. The product does not offer it yet: an
  // admin can invite, and a chain of invitations nobody approved is not what
  // a first team feature should allow.
  assert.deepEqual(INVITE_ROLES, ["member", "viewer"]);
});

test("the number of open invitations is capped to protect the sending domain", () => {
  assert.equal(MAX_PENDING_INVITATIONS, 10);
});

test("database refusals become sentences, and the raw label is never shown", () => {
  assert.equal(inviteErrorMessage("USER_ALREADY_MEMBER"), "That person is already in your workspace.");
  assert.equal(inviteErrorMessage("INVITATION_ALREADY_PENDING"), "An invitation to that address is already waiting.");
  assert.equal(inviteErrorMessage("INVALID_INVITATION_EMAIL"), "Enter a valid email address.");
  assert.equal(inviteErrorMessage("WORKSPACE_ADMIN_REQUIRED"), "Only the workspace owner can invite people.");
  assert.equal(inviteErrorMessage("PENDING_LIMIT"), "You have 10 invitations waiting. Revoke one before sending another.");
  assert.equal(inviteErrorMessage("something unexpected: relation x"), "The invitation could not be created. Try again.");
  assert.equal(inviteErrorMessage(undefined), "The invitation could not be created. Try again.");

  assert.equal(acceptErrorMessage("INVITATION_EMAIL_MISMATCH"), "This invitation was sent to a different email address. Sign in with that address to accept it.");
  assert.equal(acceptErrorMessage("INVITATION_EXPIRED"), "This invitation has expired. Ask for a new one.");
  assert.equal(acceptErrorMessage("INVITATION_NOT_PENDING"), "This invitation has already been used or was revoked.");
  assert.equal(acceptErrorMessage("INVITATION_NOT_FOUND"), "This invitation link is not valid.");
  assert.equal(acceptErrorMessage("USER_ALREADY_MEMBER"), "You are already in this workspace.");
  assert.equal(acceptErrorMessage("anything else"), "The invitation could not be accepted. Try again.");
});

test("the invitation email names who sent it, links once, and escapes what it shows", () => {
  const link = "https://zavqera.com/invite/abc";
  const email = invitationEmail({ inviterEmail: "owner@example.com", link, role: "member" });
  assert.equal(email.subject, "You are invited to a ZAVQERA workspace");
  assert.match(email.text, /owner@example\.com invited you/);
  assert.match(email.text, /https:\/\/zavqera\.com\/invite\/abc/);
  assert.match(email.text, /can view and edit/);
  assert.equal((email.html.match(/href="/g) ?? []).length, 1, "one link: fewer links, less spam scoring");
  assert.match(email.html, /href="https:\/\/zavqera\.com\/invite\/abc"/);
  assert.match(viewerText(), /can view/);
  assert.doesNotMatch(viewerText(), /edit/);

  const hostile = invitationEmail({ inviterEmail: "<script>alert(1)</script>@x.com", link, role: "member" });
  assert.doesNotMatch(hostile.html, /<script>/);
  assert.match(hostile.html, /&lt;script&gt;/);

  function viewerText() {
    return invitationEmail({ inviterEmail: "owner@example.com", link, role: "viewer" }).text;
  }
});

test("the chosen workspace is remembered in a cookie that holds only a UUID", async () => {
  const { WORKSPACE_COOKIE, workspaceCookieValue } = await import("../lib/team-workspace.mjs");
  assert.equal(WORKSPACE_COOKIE, "zavqera-workspace");
  assert.equal(workspaceCookieValue("3F2C9A1E-0000-4000-8000-000000000000"), "3f2c9a1e-0000-4000-8000-000000000000");
  for (const bad of ["", "abc", "3f2c9a1e-0000-4000-8000-00000000000z", null, undefined, "x; Path=/"]) {
    assert.equal(workspaceCookieValue(bad), null, String(bad));
  }
});

test("the missions shown are those of the chosen workspace, and only after membership is checked", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const repository = readFileSync(join(root, "lib", "supabase", "mission-repository.ts"), "utf8");
  assert.match(repository, /const workspaceId = await currentWorkspace\(supabase, user\.id\);/);
  // The cookie is a preference, not a permission: a workspace the person is
  // not a member of falls back to their own, and the database still decides.
  assert.match(repository, /\.from\("workspace_members"\)\.select\("workspace_id"\)\.eq\("workspace_id", chosen\)\.eq\("user_id", userId\)\.maybeSingle\(\)/);
  assert.match(repository, /return ownedWorkspace\(supabase\);/);
});

test("every sentence an invitation can end in is translated", async () => {
  const { readDictionaries, LANGUAGES } = await import("./helpers/dictionaries.mjs");
  const { readFileSync } = await import("node:fs");
  const module = await import("../lib/team-invitations.mjs");
  const codes = ["USER_ALREADY_MEMBER", "INVITATION_ALREADY_PENDING", "INVALID_INVITATION_EMAIL", "WORKSPACE_ADMIN_REQUIRED", "PENDING_LIMIT",
    "INVITATION_EMAIL_MISMATCH", "INVITATION_EXPIRED", "INVITATION_NOT_PENDING", "INVITATION_NOT_FOUND"];
  const sentences = new Set([
    ...codes.map(module.inviteErrorMessage), ...codes.map(module.acceptErrorMessage),
    module.INVITE_ERROR_FALLBACK, module.ACCEPT_ERROR_FALLBACK,
  ]);
  // The team routes hand these back and the page shows them as they come.
  for (const route of ["app/api/team/invitations/[id]/route.ts", "app/api/team/members/[id]/route.ts", "app/api/team/workspace/route.ts", "app/api/team/invitations/route.ts"]) {
    const body = readFileSync(new URL(`../${route}`, import.meta.url), "utf8");
    for (const match of body.matchAll(/error:\s*"((?:[^"\\]|\\.)*)"/g)) sentences.add(match[1]);
  }
  assert.ok(sentences.size >= 15, `expected the invitation messages, found ${sentences.size}`);
  const tables = readDictionaries();
  const missing = [];
  for (const sentence of sentences) {
    const absent = LANGUAGES.filter((name) => !tables[name].has(sentence));
    if (absent.length) missing.push(`"${sentence}" is missing from ${absent.join(", ")}`);
  }
  assert.deepEqual(missing, []);
});

test("the invite route invites into the inviter's own workspace and keeps the token out of storage", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../app/api/team/invitations/route.ts", import.meta.url), "utf8");
  assert.match(route, /isTrustedSameOriginRequest\(request\)/);
  // The workspace is never taken from the request body.
  assert.match(route, /rpc\("ensure_owned_workspace"\)/);
  assert.doesNotMatch(route, /body\.workspaceId/);
  assert.match(route, /p_token_hash: tokenHash/);
  // The link goes back to the browser only when the email was not sent.
  assert.match(route, /emailed \? \{ emailed: true \} : \{ emailed: false, link \}/);
  const sender = readFileSync(new URL("../lib/team-email.ts", import.meta.url), "utf8");
  assert.match(sender, /process\.env\.RESEND_API_KEY/);
  assert.match(sender, /no-reply@auth\.zavqera\.com/);
  assert.doesNotMatch(sender, /NEXT_PUBLIC_/, "the key must never reach the browser bundle");
});

test("the database allows one open invitation per address, and any number of closed ones", async () => {
  const { readFileSync } = await import("node:fs");
  const migration = readFileSync(new URL("../../../supabase/migrations/20261115200000_invitation_reinvite.sql", import.meta.url), "utf8");
  assert.match(migration, /drop constraint if exists workspace_invitations_workspace_id_email_status_key/);
  assert.match(migration, /on public\.workspace_invitations \(workspace_id, lower\(email\)\)\s+where status = 'PENDING'/);
  assert.match(migration, /set status = 'EXPIRED'[\s\S]*expires_at <= timezone\('utc', now\(\)\)[\s\S]*INVITATION_ALREADY_PENDING/);
});

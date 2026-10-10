import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const route = read("app/api/business/invitations/route.ts");
const form = read("app/app/business/invite/page.tsx");
const env = read(".env.example");

test("workspace invitation delivery uses server-side Resend configuration", () => {
  assert.match(route, /process\.env\.RESEND_API_KEY/);
  assert.match(route, /process\.env\.RESEND_FROM_EMAIL/);
  assert.match(route, /https:\/\/api\.resend\.com\/emails/);
  assert.match(route, /You’ve been invited to join a ZAVQERA workspace/);
  assert.match(route, /revokeWorkspaceInvitation\(invitation\.id\)/);
  assert.match(env, /^RESEND_API_KEY=/m);
  assert.match(env, /^RESEND_FROM_EMAIL=/m);
});

test("invitation UI confirms email delivery and no longer exposes the raw token", () => {
  assert.match(form, /Send email invitation/);
  assert.match(form, /Invitation email sent/);
  assert.doesNotMatch(form, /inviteLink|inviteToken|Secure invitation link/);
});

test("invitation response never returns the raw invitation token", () => {
  assert.match(route, /delivery: "sent"/);
  assert.doesNotMatch(route, /inviteToken:\s*token/);
});

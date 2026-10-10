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
  assert.match(route, /Idempotency-Key/);
  assert.match(route, /DEPLOY_PRIME_URL/);
  assert.match(route, /request\.nextUrl\.origin/);
  assert.match(env, /^RESEND_API_KEY=/m);
  assert.match(env, /^RESEND_FROM_EMAIL=/m);
});

test("invitation UI confirms email delivery and no longer exposes the raw token", () => {
  assert.match(form, /Send email invitation/);
  assert.match(form, /email provider accepted the invitation/i);
  assert.doesNotMatch(form, /inviteLink|inviteToken|Secure invitation link/);
});

test("invitation response never returns the raw invitation token", () => {
  assert.match(route, /delivery: "accepted"/);
  assert.doesNotMatch(route, /inviteToken:\s*token/);
});

test("invitation links use configured deploy origin instead of blindly trusting request host", () => {
  assert.match(route, /process\.env\.DEPLOY_PRIME_URL/);
  assert.match(route, /SITE_URL_NOT_CONFIGURED/);
  assert.match(route, /SITE_URL_MUST_USE_HTTPS/);
});

test("ambiguous email-provider outcomes do not invalidate a possibly delivered invitation", () => {
  assert.match(route, /network timeout is ambiguous/);
  assert.match(route, /Keep the pending invitation/);
  assert.match(route, /Check provider logs before retrying/);
});

test("invitation metadata can be loaded before sign-in, while acceptance requires auth", () => {
  const tokenRoute = read("app/api/business/invitations/[token]/route.ts");
  const getHandler = tokenRoute.slice(tokenRoute.indexOf("export async function GET("), tokenRoute.indexOf("export async function POST("));
  const postHandler = tokenRoute.slice(tokenRoute.indexOf("export async function POST("));
  const invitePage = read("app/invite/[token]/page.tsx");
  assert.match(getHandler, /createSupabaseServerClient/);
  assert.match(getHandler, /rpc\("get_workspace_invitation"/);
  assert.doesNotMatch(getHandler, /createSupabaseMissionRepository/);
  assert.match(postHandler, /supabase\.auth\.getUser\(\)/);
  assert.match(postHandler, /status: 401/);
  assert.match(invitePage, /\/auth\/sign-in\?next=/);
  assert.match(invitePage, /email-mismatch/);
  assert.match(invitePage, /accepted/);
});

test("invitation return links stay on the invitation after sign-in", () => {
  const invitePage = read("app/invite/[token]/page.tsx");
  const authForm = read("components/auth-form.tsx");
  assert.match(invitePage, /encodeURIComponent\(\`\/invite\/\${token}\`\)/);
  assert.match(authForm, /safeNextPath\(searchParams\.get\("next"\)\)/);
  assert.match(authForm, /router\.push\(nextPath\)/);
});


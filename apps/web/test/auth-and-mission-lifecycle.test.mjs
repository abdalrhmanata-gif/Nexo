import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DEFAULT_POST_AUTH_PATH, authErrorPath, resolveAuthCallbackOrigin, resolveRequestOrigin, safeNextPath } from "../lib/auth/redirect.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFile(join(webRoot, path), "utf8");

// Defect 1: Supabase email confirmation never completed because the PKCE code
// produced by /auth/v1/verify had no token-exchange endpoint to land on.

test("a PKCE token exchange endpoint exists for email confirmation links", async () => {
  const callback = await source("app/auth/callback/route.ts");
  assert.match(callback, /export async function GET/);
  assert.match(callback, /searchParams\.get\("code"\)/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /createSupabaseServerClient/);
});

test("a token hash confirmation endpoint exists for TokenHash email templates", async () => {
  const confirm = await source("app/auth/confirm/route.ts");
  assert.match(confirm, /searchParams\.get\("token_hash"\)/);
  assert.match(confirm, /searchParams\.get\("type"\)/);
  assert.match(confirm, /verifyOtp\(\{ type, token_hash: tokenHash \}\)/);
});

test("confirmation endpoints fall back to the sign-in page instead of failing hard", async () => {
  for (const file of ["app/auth/callback/route.ts", "app/auth/confirm/route.ts"]) {
    const text = await source(file);
    assert.match(text, /authErrorPath\("confirmation-link"\)/);
  }
  assert.equal(authErrorPath("confirmation-link"), "/auth/sign-in?error=confirmation-link");
});

test("sign-up sends the confirmation link back to the deployed origin callback", async () => {
  const form = await source("components/auth-form.tsx");
  assert.match(form, /emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/callback\?next=/);
});

test("middleware does not bounce signed-in users away from confirmation endpoints", async () => {
  const middleware = await source("middleware.ts");
  assert.match(middleware, /isConfirmationEndpoint/);
  assert.match(middleware, /"\/auth\/callback"/);
  assert.match(middleware, /"\/auth\/confirm"/);
  assert.match(middleware, /startsWith\("\/auth\/"\) && user && !isConfirmationEndpoint/);
});

test("confirmation redirect targets cannot leave the application origin", () => {
  assert.equal(safeNextPath("/app/missions/abc"), "/app/missions/abc");
  assert.equal(safeNextPath(DEFAULT_POST_AUTH_PATH), "/app");
  for (const hostile of [
    "https://attacker.example/app",
    "//attacker.example",
    "/\\attacker.example",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeNextPath(hostile), DEFAULT_POST_AUTH_PATH);
  }
});

// Defect 2: a created Mission could not be reopened or removed with confidence.

test("confirmation redirects stay on the host the browser is actually using", () => {
  const permalink = "https://6abbf2ee--unique-kringle-3ce321.netlify.app/auth/callback";
  const branchHost = "zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app";

  assert.equal(
    resolveRequestOrigin(new Headers({ "x-forwarded-host": branchHost, "x-forwarded-proto": "https" }), permalink),
    `https://${branchHost}`,
  );
  assert.equal(
    resolveRequestOrigin(new Headers({ host: branchHost }), permalink),
    `https://${branchHost}`,
  );
  assert.equal(
    resolveRequestOrigin(new Headers(), "http://localhost:3000/auth/callback"),
    "http://localhost:3000",
  );
});

test("confirmation endpoints redirect through the resolved request origin", async () => {
  for (const file of ["app/auth/callback/route.ts", "app/auth/confirm/route.ts"]) {
    const text = await source(file);
    assert.match(text, /const origin = resolveAuthCallbackOrigin\(process\.env\.NEXT_PUBLIC_SITE_URL, request\.headers, request\.url\)/);
    assert.doesNotMatch(text, /NextResponse\.redirect\(new URL\([^)]*request\.url\)\)/);
  }
});

test("workspace mission cards expose an explicit route into the mission detail page", async () => {
  const card = await source("components/mission-card.tsx");
  assert.match(card, /href=\{`\/app\/missions\/\$\{mission\.id\}`\}/);
  assert.match(card, /Open mission/);
});

test("mission detail page loads through the authorized repository boundary", async () => {
  const detail = await source("app/app/missions/[id]/page.tsx");
  assert.match(detail, /createSupabaseMissionRepository/);
  assert.match(detail, /repository\.getMission\(/);
  assert.match(detail, /We could not find that mission\./);
  assert.match(detail, /DeleteMissionForm/);
});

test("mission deletion requires an explicit confirmation step", async () => {
  const form = await source("components/delete-mission-form.tsx");
  assert.match(form, /confirming/);
  assert.match(form, /Yes, delete permanently/);
  assert.match(form, /Cancel/);
  assert.match(form, /name="_method" value="DELETE"/);
});

test("mission deletion is authorized server-side and never trusts the client", async () => {
  const route = await source("app/api/missions/[id]/route.ts");
  assert.match(route, /createSupabaseMissionRepository/);
  assert.match(route, /repository\.deleteMission\?\.\(id\)/);
  assert.match(route, /"Authentication required\."/);
  assert.doesNotMatch(route, /\b(owner_id|user_id)\b/);

  const repository = await source("lib/supabase/mission-repository.ts");
  assert.match(repository, /ownedWorkspace\(supabase, user\.id\)/);
});

test("configured public origin takes precedence over forwarded host for auth callbacks", () => {
  const headers = new Headers({ "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" });
  assert.equal(
    resolveAuthCallbackOrigin("https://zavqera-preview.netlify.app", headers, "https://attacker.example/auth/callback"),
    "https://zavqera-preview.netlify.app",
  );
  assert.equal(
    resolveAuthCallbackOrigin("not a url", new Headers({ host: "localhost:3000" }), "http://localhost:3000/auth/callback"),
    "http://localhost:3000",
  );
});

test("mission deletion reports success only after a row is actually deleted", async () => {
  const repository = await source("lib/supabase/mission-repository.ts");
  assert.match(repository, /\.delete\(\)[\s\S]*?\.eq\("workspace_id", workspaceId\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(repository, /if \(!result\.data\) throw new MissionMutationRejectedError/);
});

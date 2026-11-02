import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const middlewarePath = fileURLToPath(new URL("../middleware.ts", import.meta.url));
const middleware = readFileSync(middlewarePath, "utf8");

test("Next middleware applies the origin boundary to API routes before any configuration early return", () => {
  assert.match(middleware, /from "\.\/lib\/request-origin\.mjs"/);
  assert.match(middleware, /shouldEnforceSameOriginForApiRequest\(request\)\s*&&\s*!isTrustedSameOriginRequest\(request\)/);
  assert.match(middleware, /Untrusted request origin\./);
  assert.match(middleware, /status:\s*403/);
  assert.match(middleware, /matcher:\s*\[\s*"\/api\/:path\*"/);
  assert.ok(
    middleware.indexOf('if (request.nextUrl.pathname.startsWith("/api/"))')
      < middleware.indexOf('const supabaseUrl = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL")'),
    "API origin validation must run before Supabase configuration can bypass it",
  );
});

test("internal worker exclusion is documented at the API middleware boundary", () => {
  assert.match(middleware, /internal worker route authenticates/);
  assert.match(middleware, /server-to-server requests independently/);
});

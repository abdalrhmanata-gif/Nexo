import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseAuthorizationHeader } from "../lib/bearer-auth.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const route = readFileSync(path.join(root, "apps/web/app/api/ai/plan/route.ts"), "utf8");
const server = readFileSync(path.join(root, "apps/web/lib/supabase/server.ts"), "utf8");
const usage = readFileSync(path.join(root, "apps/web/lib/ai-usage.ts"), "utf8");

test("requests without Authorization retain the cookie-session path", () => {
  assert.deepEqual(parseAuthorizationHeader(null), { kind: "cookie" });
});

test("valid bearer authorization yields only the opaque access token", () => {
  assert.deepEqual(parseAuthorizationHeader("Bearer user.jwt.token"), {
    kind: "bearer",
    token: "user.jwt.token",
  });
  assert.deepEqual(parseAuthorizationHeader("  bEaReR   user.jwt.token  "), {
    kind: "bearer",
    token: "user.jwt.token",
  });
});

test("malformed or non-bearer Authorization never falls back to cookies", () => {
  for (const value of ["", "Basic user.token", "Bearer", "Bearer token extra", "Bearer token\nextra"]) {
    assert.deepEqual(parseAuthorizationHeader(value), { kind: "invalid" }, value);
  }
});

test("bearer route validates the token and reuses its user-scoped client for quota settlement", () => {
  assert.ok(route.includes("getAuthenticatedBearerContext(authorization.token)"));
  assert.ok(route.includes("reserveAiGeneration("));
  assert.ok(route.includes("quotaSupabaseClient,"));
  assert.ok(route.includes("consumeAiGeneration(reservationId, quotaSupabaseClient)"));
  assert.ok(route.includes("releaseAiGeneration(reservationId, quotaSupabaseClient)"));
  assert.ok(server.includes("await supabase.auth.getUser(accessToken)"));
  assert.ok(server.includes("accessToken: async () => accessToken"));
  assert.ok(usage.includes("resolveUsageClient(client)"));
});

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { isTrustedExecutionWorkerRequest } from "../lib/mission-authority/worker-auth.mjs";
import { resolveTrustedDispatchAdapter } from "../lib/mission-authority/provider-adapter-registry.mjs";

const TOKEN = "worker-token-abcdefghijklmnopqrstuvwxyz-123456";
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("accepts only the exact bearer token configured for the trusted worker", () => {
  assert.equal(isTrustedExecutionWorkerRequest(`Bearer ${TOKEN}`, TOKEN), true);
});

test("rejects missing, query-style, malformed and wrong tokens", () => {
  assert.equal(isTrustedExecutionWorkerRequest(null, TOKEN), false);
  assert.equal(isTrustedExecutionWorkerRequest(TOKEN, TOKEN), false);
  assert.equal(isTrustedExecutionWorkerRequest("Bearer short", TOKEN), false);
  assert.equal(isTrustedExecutionWorkerRequest(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(isTrustedExecutionWorkerRequest(`Bearer ${TOKEN}`, "short"), false);
  assert.equal(isTrustedExecutionWorkerRequest(`Bearer ${TOKEN}`, undefined), false);
});

test("dispatch adapter registry remains fail-closed until a provider is reviewed", () => {
  assert.equal(resolveTrustedDispatchAdapter("provider.send.v1"), null);
  assert.equal(resolveTrustedDispatchAdapter("unknown-provider"), null);
  assert.equal(resolveTrustedDispatchAdapter(""), null);
});

test("privileged worker route uses server-only credentials and cannot dispatch without a reviewed adapter", async () => {
  const admin = await readFile(join(webRoot, "lib", "supabase", "admin.ts"), "utf8");
  const route = await readFile(join(webRoot, "app", "api", "internal", "agent-executions", "[executionId]", "dispatch", "route.ts"), "utf8");
  assert.match(admin, /import ["']server-only["']/);
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /ZAVQERA_EXECUTION_WORKER_TOKEN/);
  assert.match(route, /isTrustedExecutionWorkerRequest/);
  assert.match(route, /resolveTrustedDispatchAdapter/);
  assert.match(route, /No reviewed provider adapter is registered\. No dispatch occurred\./);
  assert.match(route, /dispatchThroughJitClaim/);
});

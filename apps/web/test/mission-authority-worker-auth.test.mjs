import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { isTrustedExecutionWorkerRequest } from "../lib/mission-authority/worker-auth.mjs";
import { resolveTrustedWorkerOrigin } from "../lib/mission-authority/trusted-worker-origin.mjs";
import {
  hasTrustedProviderAdapterContractShape,
  resolveTrustedDispatchAdapter,
} from "../lib/mission-authority/provider-adapter-registry.mjs";

const TOKEN = "worker-token-abcdefghijklmnopqrstuvwxyz-123456";
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function listApiRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listApiRouteFiles(path);
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  }));
  return nested.flat();
}

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

test("provider adapter contract requires exact audience, dispatch and reconciliation", () => {
  const valid = {
    audience: "provider.send.v1",
    dispatch: async () => ({ state: "UNKNOWN" }),
    reconcile: async () => ({ state: "UNKNOWN" }),
  };
  assert.equal(hasTrustedProviderAdapterContractShape("provider.send.v1", valid), true);
  assert.equal(hasTrustedProviderAdapterContractShape("provider.other.v1", valid), false);
  assert.equal(hasTrustedProviderAdapterContractShape("provider.send.v1", {
    audience: "provider.send.v1",
    dispatch: async () => ({ state: "UNKNOWN" }),
  }), false, "dispatch-only adapters must not pass registration validation");
  assert.equal(hasTrustedProviderAdapterContractShape("provider.send.v1", {
    audience: "provider.send.v1",
    reconcile: async () => ({ state: "UNKNOWN" }),
  }), false, "reconciliation-only adapters cannot dispatch");
  assert.equal(hasTrustedProviderAdapterContractShape("provider.send.v1", []), false);
  assert.equal(hasTrustedProviderAdapterContractShape("", valid), false);
  assert.equal(hasTrustedProviderAdapterContractShape("x".repeat(129), valid), false);
});

test("dispatch adapter registry remains fail-closed until a provider is reviewed", () => {
  assert.equal(resolveTrustedDispatchAdapter("provider.send.v1"), null);
  assert.equal(resolveTrustedDispatchAdapter("unknown-provider"), null);
  assert.equal(resolveTrustedDispatchAdapter(""), null);
});

test("privileged worker route uses server-only credentials and the runtime boundary", async () => {
  const admin = await readFile(join(webRoot, "lib", "supabase", "admin.ts"), "utf8");
  const route = await readFile(join(webRoot, "app", "api", "internal", "agent-executions", "[executionId]", "route.ts"), "utf8");
  assert.match(admin, /import ["']server-only["']/);
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /ZAVQERA_EXECUTION_WORKER_TOKEN/);
  assert.match(route, /isTrustedExecutionWorkerRequest/);
  assert.match(route, /resolveTrustedDispatchAdapter/);
  assert.match(route, /runMissionActionWorker/);
  assert.ok(route.includes("No reviewed provider adapter is registered. No provider call occurred."));
  assert.ok(route.includes("The registered provider adapter has no reviewed dispatch implementation."));
  assert.match(route, /dispatchThroughJitClaim/);
  assert.match(route, /reconcileThroughTrustedClaim/);
  assert.match(route, /Only a valid operation and provider audience are accepted/);
  const operationValidation = route.indexOf('if (bodyKeys.some((key) => key !== "operation" && key !== "audience")');
  const executionValidation = route.indexOf("if (!UUID_PATTERN.test(executionId))", operationValidation);
  const boundaryCall = route.indexOf("runMissionActionWorker({", executionValidation);
  assert.ok(operationValidation >= 0 && executionValidation > operationValidation && boundaryCall > executionValidation);
});


test("trusted worker origin uses loopback locally and fixed HTTPS deployment URLs", () => {
  assert.equal(resolveTrustedWorkerOrigin({
    nodeEnv: "test",
    e2eRuntimeBaseUrl: "http://127.0.0.1:3100/",
    deployPrimeUrl: "https://preview.example.net",
    requestUrl: "http://127.0.0.1:3000/api/research",
  }), "http://127.0.0.1:3100");
  assert.equal(resolveTrustedWorkerOrigin({
    nodeEnv: "development",
    deployPrimeUrl: "https://unrelated.example.net",
    requestUrl: "http://localhost:3000/api/research",
  }), "http://localhost:3000");
  assert.equal(resolveTrustedWorkerOrigin({
    nodeEnv: "production",
    deployPrimeUrl: "https://deploy-preview-29--unique-kringle-3ce321.netlify.app/",
    requestUrl: "https://attacker.example/api/research",
  }), "https://deploy-preview-29--unique-kringle-3ce321.netlify.app");
});

test("trusted worker origin rejects attacker request URLs, insecure external targets and credentials", () => {
  assert.equal(resolveTrustedWorkerOrigin({
    nodeEnv: "production",
    e2eRuntimeBaseUrl: "http://127.0.0.1:3000",
    requestUrl: "https://attacker.example/api/research",
  }), null);
  assert.equal(resolveTrustedWorkerOrigin({
    nodeEnv: "production",
    deployPrimeUrl: "http://public.example.net",
    deployUrl: "https://user:password@trusted.example.net",
    requestUrl: "https://attacker.example.net",
  }), null);
  assert.equal(resolveTrustedWorkerOrigin({
    nodeEnv: "production",
    deployPrimeUrl: "https://trusted.example.net/arbitrary/path",
    publicSiteUrl: "https://trusted.example.net/?redirect=attacker",
  }), null);
});

test("trusted research completion is a narrow worker operation behind the authenticated route", async () => {
  const route = await readFile(join(webRoot, "app", "api", "internal", "agent-executions", "[executionId]", "route.ts"), "utf8");
  assert.match(route, /isTrustedExecutionWorkerRequest/);
  assert.match(route, /workerBody\.operation === "preflight_read_only_research"/);
  assert.match(route, /isResearchCompletionSchemaProbeError\(probe\.error\)/);
  assert.match(route, /p_execution_id: RESEARCH_COMPLETION_SCHEMA_PROBE_UUID/);
  assert.match(route, /ready: true/);
  assert.match(route, /workerBody\.operation === "complete_read_only_research"/);
  assert.match(route, /permittedKeys = new Set\(\["operation", "requestedBy", "status", "result", "evidence"\]\)/);
  assert.match(route, /!UUID_PATTERN\.test\(workerBody\.requestedBy\)/);
  assert.match(route, /MAX_INTERNAL_BODY_BYTES/);
  assert.match(route, /p_requested_by: workerBody\.requestedBy/);
  assert.match(route, /completion\.data\.id !== executionId/);
  assert.match(route, /completion\.data\.status !== workerBody\.status/);
});


test("mission-action worker route validates input before invoking the runtime boundary", async () => {
  const route = await readFile(join(webRoot, "app", "api", "internal", "agent-executions", "[executionId]", "route.ts"), "utf8");
  const dispatchInputValidation = route.indexOf('if (bodyKeys.some((key) => key !== "operation" && key !== "audience")');
  const executionValidation = route.indexOf("if (!UUID_PATTERN.test(executionId))", dispatchInputValidation);
  const boundaryCall = route.indexOf("runMissionActionWorker({", executionValidation);
  assert.ok(dispatchInputValidation >= 0, "dispatch/reconciliation input validation must be present");
  assert.ok(executionValidation > dispatchInputValidation, "execution id must be validated after the operation shape");
  assert.ok(boundaryCall > executionValidation, "only validated requests may reach the runtime boundary");
});


test("mission-action dispatch and reconciliation gateway is reachable only through the trusted internal worker route", async () => {
  const apiRoot = join(webRoot, "app", "api");
  const routeFiles = await listApiRouteFiles(apiRoot);
  const gatewayConsumers = [];

  for (const path of routeFiles) {
    const source = await readFile(path, "utf8");
    const importsGateway = /from\s+["'][^"']*mission-authority\/persistent-dispatch-gateway(?:\.mjs)?["']/.test(source);
    const callsGateway = /\b(?:dispatchThroughJitClaim|reconcileThroughTrustedClaim)\b/.test(source);
    if (importsGateway || callsGateway) {
      gatewayConsumers.push(path.slice(apiRoot.length + 1).replace(/\\/g, "/"));
    }
  }

  assert.deepEqual(
    gatewayConsumers,
    ["internal/agent-executions/[executionId]/route.ts"],
    "all Mission Action dispatch/reconciliation gateway access must remain behind the trusted internal worker route",
  );
});

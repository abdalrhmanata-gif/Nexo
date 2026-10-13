import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { isTrustedExecutionWorkerRequest } from "../lib/mission-authority/worker-auth.mjs";
import { resolveTrustedWorkerOrigin } from "../lib/mission-authority/trusted-worker-origin.mjs";
import { runMissionActionWorker } from "../lib/mission-authority/mission-action-worker-boundary.mjs";
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

const LOCAL_SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

async function resolveLocalSourceImport(specifier, importer) {
  let base;
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = resolve(dirname(importer), specifier);
  } else if (specifier.startsWith("@/")) {
    base = resolve(webRoot, specifier.slice(2));
  } else {
    return null;
  }

  const candidates = [
    base,
    ...LOCAL_SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...LOCAL_SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];

  for (const candidate of candidates) {
    if (candidate !== webRoot && !candidate.startsWith(`${webRoot}/`)) continue;
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Non-resolving source candidates are normal while checking extensionless imports.
    }
  }
  return null;
}

function readStaticLocalImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /^\s*(?:import|export)\s+(?!\s*\()(?:(?!;)[\s\S])*?\sfrom\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

async function findReachableSensitiveModule(entry, sensitiveModules, visited = new Set()) {
  if (sensitiveModules.has(entry)) return [entry];
  if (visited.has(entry)) return null;
  visited.add(entry);

  const source = await readFile(entry, "utf8");
  for (const specifier of readStaticLocalImportSpecifiers(source)) {
    const resolved = await resolveLocalSourceImport(specifier, entry);
    if (!resolved) continue;
    const childPath = await findReachableSensitiveModule(resolved, sensitiveModules, visited);
    if (childPath) return [entry, ...childPath];
  }
  return null;
}

async function collectReachableLocalSourceModules(entry, visited = new Set()) {
  if (visited.has(entry)) return visited;
  visited.add(entry);
  const source = await readFile(entry, "utf8");
  for (const specifier of readStaticLocalImportSpecifiers(source)) {
    const resolved = await resolveLocalSourceImport(specifier, entry);
    if (resolved) await collectReachableLocalSourceModules(resolved, visited);
  }
  return visited;
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


test("Mission Action execution boundary is directly referenced only by the trusted internal worker route", async () => {
  const apiRoot = join(webRoot, "app", "api");
  const routeFiles = await listApiRouteFiles(apiRoot);
  const gatewayConsumers = [];

  for (const path of routeFiles) {
    const source = await readFile(path, "utf8");
    const importsPrivilegedBoundary = /from\s+["'][^"']*mission-authority\/(?:persistent-dispatch-gateway|mission-action-worker-boundary|provider-adapter-registry)(?:\.mjs)?["']/.test(source);
    const referencesPrivilegedBoundary = /\b(?:dispatchThroughJitClaim|reconcileThroughTrustedClaim|runMissionActionWorker|resolveTrustedDispatchAdapter)\b/.test(source);
    if (importsPrivilegedBoundary || referencesPrivilegedBoundary) {
      gatewayConsumers.push(path.slice(apiRoot.length + 1).replace(/\\/g, "/"));
    }
  }

  assert.deepEqual(
    gatewayConsumers,
    ["internal/agent-executions/[executionId]/route.ts"],
    "only the trusted internal worker route may import or reference the JIT gateway, worker boundary, or trusted adapter registry",
  );
});


test("mission-action worker denies absent or incomplete trusted adapters before privileged client creation", async () => {
  const audience = "provider.send.v1";
  const completeAdapter = {
    audience,
    dispatch: async () => ({ state: "FAKE_ACCEPTED" }),
    reconcile: async () => ({ state: "FAKE_UNKNOWN" }),
  };
  const cases = [
    { name: "missing adapter", operation: "dispatch", adapter: null, expected: "missing_adapter" },
    { name: "wrong audience", operation: "dispatch", adapter: { ...completeAdapter, audience: "provider.other.v1" }, expected: "missing_adapter" },
    { name: "missing dispatch implementation", operation: "dispatch", adapter: { audience, reconcile: async () => ({ state: "FAKE_UNKNOWN" }) }, expected: "missing_dispatch" },
    { name: "missing reconciliation implementation", operation: "reconcile", adapter: { audience, dispatch: async () => ({ state: "FAKE_ACCEPTED" }) }, expected: "missing_reconciliation" },
  ];

  for (const testCase of cases) {
    let clientCreations = 0;
    let dispatchCalls = 0;
    let reconcileCalls = 0;

    const result = await runMissionActionWorker({
      audience,
      operation: testCase.operation,
      executionId: "execution-test-id",
      resolveAdapter: () => testCase.adapter,
      createClient: () => {
        clientCreations += 1;
        return { kind: "test-only-client" };
      },
      dispatch: async () => {
        dispatchCalls += 1;
        return { state: "FAKE_ACCEPTED" };
      },
      reconcile: async () => {
        reconcileCalls += 1;
        return { state: "FAKE_UNKNOWN" };
      },
    });

    assert.deepEqual(result, { kind: testCase.expected }, testCase.name);
    assert.equal(clientCreations, 0, `${testCase.name}: privileged client must not be created`);
    assert.equal(dispatchCalls, 0, `${testCase.name}: dispatch must not be called`);
    assert.equal(reconcileCalls, 0, `${testCase.name}: reconciliation must not be called`);
  }
});

test("mission-action worker creates its client only after validating a complete trusted adapter", async () => {
  const audience = "provider.send.v1";
  const expectedClient = { kind: "test-only-client" };
  const events = [];
  const adapter = {
    audience,
    dispatch: async () => ({ state: "FAKE_ACCEPTED" }),
    reconcile: async () => ({ state: "FAKE_UNKNOWN" }),
  };

  const result = await runMissionActionWorker({
    audience,
    operation: "dispatch",
    executionId: "execution-test-id",
    resolveAdapter: (requestedAudience) => {
      events.push("resolve-adapter");
      assert.equal(requestedAudience, audience);
      return adapter;
    },
    createClient: () => {
      events.push("create-client");
      return expectedClient;
    },
    dispatch: async ({ client, adapter: trustedAdapter, executionId }) => {
      events.push("dispatch");
      assert.equal(client, expectedClient);
      assert.equal(trustedAdapter, adapter);
      assert.equal(executionId, "execution-test-id");
      return { state: "FAKE_ACCEPTED" };
    },
    reconcile: async () => {
      events.push("reconcile");
      return { state: "FAKE_UNKNOWN" };
    },
  });

  assert.deepEqual(result, { kind: "completed", result: { state: "FAKE_ACCEPTED" } });
  assert.deepEqual(events, ["resolve-adapter", "create-client", "dispatch"]);
});


test("mission-action worker rejects unsupported operations before adapter resolution or privileged client creation", async () => {
  let adapterResolutions = 0;
  let clientCreations = 0;
  let dispatchCalls = 0;
  let reconcileCalls = 0;

  const result = await runMissionActionWorker({
    audience: "provider.send.v1",
    operation: "execute_anything",
    executionId: "execution-test-id",
    resolveAdapter: () => {
      adapterResolutions += 1;
      return {
        audience: "provider.send.v1",
        dispatch: async () => ({ state: "FAKE_ACCEPTED" }),
        reconcile: async () => ({ state: "FAKE_UNKNOWN" }),
      };
    },
    createClient: () => {
      clientCreations += 1;
      return { kind: "test-only-client" };
    },
    dispatch: async () => {
      dispatchCalls += 1;
      return { state: "FAKE_ACCEPTED" };
    },
    reconcile: async () => {
      reconcileCalls += 1;
      return { state: "FAKE_UNKNOWN" };
    },
  });

  assert.deepEqual(result, { kind: "invalid_operation" });
  assert.equal(adapterResolutions, 0);
  assert.equal(clientCreations, 0);
  assert.equal(dispatchCalls, 0);
  assert.equal(reconcileCalls, 0);
});


test("only the trusted internal worker route transitively reaches Mission Action dispatch modules", async () => {
  const apiRoot = join(webRoot, "app", "api");
  const routeFiles = await listApiRouteFiles(apiRoot);
  const sensitiveModules = new Set([
    join(webRoot, "lib", "mission-authority", "persistent-dispatch-gateway.mjs"),
    join(webRoot, "lib", "mission-authority", "mission-action-worker-boundary.mjs"),
    join(webRoot, "lib", "mission-authority", "provider-adapter-registry.mjs"),
  ]);
  const reachableRoutes = [];

  for (const routeFile of routeFiles) {
    const chain = await findReachableSensitiveModule(routeFile, sensitiveModules);
    if (!chain) continue;
    reachableRoutes.push({
      route: relative(apiRoot, routeFile).replace(/\\\\/g, "/"),
      target: relative(webRoot, chain.at(-1)).replace(/\\\\/g, "/"),
    });
  }

  assert.deepEqual(
    reachableRoutes,
    [{
      route: "internal/agent-executions/[executionId]/route.ts",
      target: "lib/mission-authority/persistent-dispatch-gateway.mjs",
    }],
    "no other API route may reach Mission Action dispatch, worker-boundary or trusted-registry modules even through local static imports",
  );
});


const DIRECT_OUTBOUND_PATTERNS = [
  { name: "fetch()", pattern: new RegExp("\\bfetch\\s*\\(", "g") },
  { name: "axios/got/undici request", pattern: new RegExp("\\b(?:axios|got|undici)\\.(?:request|get|post|put|patch|delete)\\s*\\(", "g") },
  { name: "Node HTTP request", pattern: new RegExp("\\b(?:http|https)\\.request\\s*\\(", "g") },
  { name: "computed import()", pattern: /\bimport\s*\(\s*(?!["'])/g },
  { name: "computed require()", pattern: /\brequire\s*\(\s*(?!["'])/g },
  { name: "createRequire()", pattern: /\bcreateRequire\s*\(/g },
];
const EXPLICIT_HTTP_IMPORTS = /^(?:node:)?(?:http|https|axios|got|undici)$/;
const EXPLICIT_PROVIDER_SDK_IMPORTS = new Set([
  "openai",
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "resend",
  "nodemailer",
  "@sendgrid/mail",
  "stripe",
  "twilio",
  "@aws-sdk/client-ses",
  "@slack/web-api",
  "googleapis",
  "@microsoft/microsoft-graph-client",
]);

test("outbound-source detectors recognize representative transport and dynamic-loader escapes", () => {
  const positiveExamples = [
    ["fetch()", "await fetch(url)"],
    ["axios/got/undici request", "await axios.post(url, body)"],
    ["Node HTTP request", "https.request(options)"],
    ["computed import()", "await import(providerModuleName)"],
    ["computed require()", "require(providerPackageName)"],
    ["createRequire()", "const localRequire = createRequire(import.meta.url)"],
  ];

  for (const [name, source] of positiveExamples) {
    const detector = DIRECT_OUTBOUND_PATTERNS.find((entry) => entry.name === name);
    assert.ok(detector, name + ": detector must be configured");
    detector.pattern.lastIndex = 0;
    assert.equal(detector.pattern.test(source), true, name + ": representative escape must be detected");
  }

  const computedImport = DIRECT_OUTBOUND_PATTERNS.find((entry) => entry.name === "computed import()");
  const computedRequire = DIRECT_OUTBOUND_PATTERNS.find((entry) => entry.name === "computed require()");
  computedImport.pattern.lastIndex = 0;
  computedRequire.pattern.lastIndex = 0;
  assert.equal(computedImport.pattern.test('await import("./trusted-local.mjs")'), false,
    "a literal local import is followed by the source-graph traversal, not classified as computed");
  assert.equal(computedRequire.pattern.test('require("./trusted-local.cjs")'), false,
    "a literal local require is followed by the source-graph traversal, not classified as computed");

  assert.equal(EXPLICIT_HTTP_IMPORTS.test("node:https"), true);
  assert.equal(EXPLICIT_HTTP_IMPORTS.test("node:fs"), false);
  const specifiers = readStaticLocalImportSpecifiers(
    'import Client from "openai";\\nconst mail = require("resend");',
  );
  assert.deepEqual(specifiers.sort(), ["openai", "resend"]);
  assert.equal(specifiers.every((specifier) => EXPLICIT_PROVIDER_SDK_IMPORTS.has(specifier)), true,
    "known provider SDKs are recognized as outbound-capable dependencies");
});

test("Mission Action API dependency graphs cannot call outbound HTTP directly", async () => {
  const apiRoot = join(webRoot, "app", "api");
  const routeFiles = await listApiRouteFiles(apiRoot);
  const actionRouteFiles = routeFiles.filter((routeFile) => {
    const route = relative(apiRoot, routeFile).replace(/\\\\/g, "/");
    if (route.startsWith("missions/[id]/research/")) return false; // separately bounded read-only Research path
    return route.startsWith("agent-executions/")
      || route.startsWith("internal/agent-executions/")
      || route.startsWith("missions/");
  });
  const violations = [];

  for (const routeFile of actionRouteFiles) {
    const route = relative(apiRoot, routeFile).replace(/\\\\/g, "/");
    const reachable = await collectReachableLocalSourceModules(routeFile);
    for (const modulePath of reachable) {
      const source = await readFile(modulePath, "utf8");
      const moduleName = relative(webRoot, modulePath).replace(/\\\\/g, "/");

      for (const specifier of readStaticLocalImportSpecifiers(source)) {
        if (EXPLICIT_HTTP_IMPORTS.test(specifier)) {
          violations.push({ route, module: moduleName, marker: `transport import: ${specifier}` });
        }
        if (EXPLICIT_PROVIDER_SDK_IMPORTS.has(specifier)) {
          violations.push({ route, module: moduleName, marker: `provider SDK import: ${specifier}` });
        }
      }

      for (const { name, pattern } of DIRECT_OUTBOUND_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          const line = source.slice(0, match.index).split("\n").length;
          violations.push({ route, module: moduleName, marker: `${name} at line ${line}` });
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    "Mission Action routes must not add direct outbound HTTP calls in their statically reachable local source graph; provider I/O belongs behind the trusted JIT adapter. Read-only Research is inventoried separately.",
  );
});

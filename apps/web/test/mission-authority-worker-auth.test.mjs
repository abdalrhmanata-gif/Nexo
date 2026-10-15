import { readFile, readdir, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
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
    if (candidate !== webRoot && !candidate.startsWith(`${webRoot}${process.platform === "win32" ? "\\" : "/"}`)) continue;
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

test("privileged worker route uses server-only credentials and the shared runtime HTTP/JIT gate", async () => {
  const admin = await readFile(join(webRoot, "lib", "supabase", "admin.ts"), "utf8");
  const route = await readFile(join(webRoot, "app", "api", "internal", "agent-executions", "[executionId]", "route.ts"), "utf8");
  const workerHttp = await readFile(join(webRoot, "lib", "mission-authority", "trusted-worker-http.mjs"), "utf8");
  assert.match(admin, /import ["']server-only["']/);
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /ZAVQERA_EXECUTION_WORKER_TOKEN/);
  assert.match(route, /parseTrustedWorkerRequest/);
  assert.match(workerHttp, /isTrustedExecutionWorkerRequest/);
  assert.match(route, /resolveTrustedDispatchAdapter/);
  assert.match(route, /createMissionActionWorkerOperationHandler/);
  assert.match(workerHttp, /runMissionActionWorker\(\{/);
  assert.ok(workerHttp.includes("No reviewed provider adapter is registered. No provider call occurred."));
  assert.ok(workerHttp.includes("The registered provider adapter has no reviewed dispatch implementation."));
  assert.match(route, /dispatchThroughJitClaim/);
  assert.match(route, /reconcileThroughTrustedClaim/);
  assert.match(workerHttp, /Only a valid operation and provider audience are accepted/);
  const parseCall = route.indexOf("parseTrustedWorkerRequest(");
  const researchHandler = route.indexOf('if (workerBody.operation === "preflight_read_only_research")');
  const operationHandler = route.indexOf("handleMissionActionWorkerOperation({ workerBody, executionId })");
  assert.ok(parseCall >= 0 && researchHandler > parseCall && operationHandler > researchHandler);
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

test("trusted research completion is a narrow worker operation behind the shared authenticated request gate", async () => {
  const route = await readFile(join(webRoot, "app", "api", "internal", "agent-executions", "[executionId]", "route.ts"), "utf8");
  const workerHttp = await readFile(join(webRoot, "lib", "mission-authority", "trusted-worker-http.mjs"), "utf8");
  assert.match(workerHttp, /isTrustedExecutionWorkerRequest/);
  assert.match(route, /workerBody\.operation === "preflight_read_only_research"/);
  assert.match(route, /isResearchCompletionSchemaProbeError\(probe\.error\)/);
  assert.match(route, /p_execution_id: RESEARCH_COMPLETION_SCHEMA_PROBE_UUID/);
  assert.match(route, /ready: true/);
  assert.match(route, /workerBody\.operation === "complete_read_only_research"/);
  assert.match(route, /permittedKeys = new Set\(\["operation", "requestedBy", "status", "result", "evidence", "errorCode", "errorMessage"\]\)/);
  assert.match(route, /p_error_code: typeof workerBody\.errorCode === "string" \? workerBody\.errorCode : null/);
  assert.match(route, /!UUID_PATTERN\.test\(workerBody\.requestedBy\)/);
  assert.match(workerHttp, /MAX_INTERNAL_BODY_BYTES/);
  assert.match(route, /p_requested_by: workerBody\.requestedBy/);
  assert.match(route, /completion\.data\.id !== executionId/);
  assert.match(route, /completion\.data\.status !== workerBody\.status/);
});


test("mission-action HTTP operation validates body and execution binding before the runtime boundary", async () => {
  const workerHttp = await readFile(join(webRoot, "lib", "mission-authority", "trusted-worker-http.mjs"), "utf8");
  const dispatchInputValidation = workerHttp.indexOf('if (bodyKeys.some((key) => key !== "operation" && key !== "audience")');
  const executionValidation = workerHttp.indexOf('if (typeof executionId !== "string" || !UUID_PATTERN.test(executionId))', dispatchInputValidation);
  const boundaryCall = workerHttp.indexOf("runMissionActionWorker({", executionValidation);
  assert.ok(dispatchInputValidation >= 0, "dispatch/reconciliation input validation must be present");
  assert.ok(executionValidation > dispatchInputValidation, "execution id must be validated after the operation shape");
  assert.ok(boundaryCall > executionValidation, "only validated requests may reach the runtime boundary");
});


test("injectable trusted-worker HTTP/JIT factory is imported only by the protected worker route", async () => {
  const apiRoot = join(webRoot, "app", "api");
  const routeFiles = await listApiRouteFiles(apiRoot);
  const consumers = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    if (/from\s+["'][^"']*mission-authority\/trusted-worker-http(?:\.mjs)?["']/.test(source)) {
      consumers.push(relative(apiRoot, routeFile).replace(/\\\\/g, "/"));
    }
  }

  assert.deepEqual(
    consumers,
    ["internal/agent-executions/[executionId]/route.ts"],
    "only the authenticated internal worker route may instantiate the dependency-injected HTTP/JIT handler",
  );
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


test("only the trusted internal worker route reaches Mission Action dispatch modules from every production entrypoint graph", async () => {
  const appRoot = join(webRoot, "app");
  const sourceFiles = await listRuntimeSourceFiles(webRoot);
  const routeFiles = await listApiRouteFiles(appRoot);
  const entrypoints = new Set(routeFiles);

  // Next.js server-rendered entrypoints can execute helper code too. Include
  // pages/layouts/templates and metadata handlers, middleware, instrumentation,
  // legacy/platform function roots, and every reviewed "use server" module.
  const appRenderEntrypointPattern = /^app\/.+\/(?:page|layout|template|default|loading|error|not-found|global-error|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.(?:ts|tsx|js|jsx)$/;
  const infrastructureEntrypointPattern = /^(?:middleware|instrumentation|instrumentation-client)\.(?:ts|tsx|js|jsx)$/;
  const serverActionPattern = /^\s*["']use server["'];?\s*(?:\/\/.*)?$/m;
  const backgroundEntrypointPattern = /(^|\/)(?:workers?|jobs?|cron|scheduled|tasks?|queues?)(\/|$)|^(?:functions|netlify\/functions|pages\/api)\//i;

  const backgroundEntrypoints = [];
  for (const sourceFile of sourceFiles) {
    const relativePath = relative(webRoot, sourceFile).replace(/\\/g, "/");
    const source = await readFile(sourceFile, "utf8");
    if (appRenderEntrypointPattern.test(relativePath)
        || infrastructureEntrypointPattern.test(relativePath)
        || serverActionPattern.test(source)
        || backgroundEntrypointPattern.test(relativePath)) {
      entrypoints.add(sourceFile);
    }
    if (backgroundEntrypointPattern.test(relativePath)) backgroundEntrypoints.push(relativePath);
  }

  // No scheduled/background/worker/function entrypoint exists in this web app
  // today. A future one must be inventoried and reviewed explicitly before it
  // can enter the runtime; test tooling under /tool is intentionally separate.
  const reviewedBackgroundEntrypoints = [];
  assert.deepEqual(
    backgroundEntrypoints.sort(),
    reviewedBackgroundEntrypoints,
    "new worker/job/cron/scheduled/queue/platform-function entrypoints require explicit review and inventory",
  );

  const sensitiveModules = new Set([
    join(webRoot, "lib", "mission-authority", "persistent-dispatch-gateway.mjs"),
    join(webRoot, "lib", "mission-authority", "mission-action-worker-boundary.mjs"),
    join(webRoot, "lib", "mission-authority", "provider-adapter-registry.mjs"),
  ]);
  const reachableEntrypoints = [];

  for (const entrypoint of [...entrypoints].sort()) {
    const chain = await findReachableSensitiveModule(entrypoint, sensitiveModules);
    if (!chain) continue;
    reachableEntrypoints.push({
      entrypoint: relative(webRoot, entrypoint).replace(/\\/g, "/"),
      target: relative(webRoot, chain.at(-1)).replace(/\\/g, "/"),
    });
  }

  assert.deepEqual(
    reachableEntrypoints,
    [{
      entrypoint: "app/api/internal/agent-executions/[executionId]/route.ts",
      target: "lib/mission-authority/persistent-dispatch-gateway.mjs",
    }],
    "only the trusted worker route may reach Mission Action dispatch, worker-boundary or trusted-registry modules from any statically discovered production entrypoint",
  );
});


const DIRECT_OUTBOUND_PATTERNS = [
  { name: "fetch()", pattern: new RegExp("\\bfetch\\s*\\(", "g") },
  { name: "fetch.call/apply", pattern: /\bfetch\s*\.\s*(?:call|apply)\s*\(/g },
  { name: "computed global transport access", pattern: /\b(?:globalThis|global|self|window)\s*\[\s*["'](?:fetch|WebSocket|XMLHttpRequest|EventSource)["']\s*\]/g },
  { name: "WebSocket/EventSource/XHR constructor", pattern: /\bnew\s+(?:WebSocket|EventSource|XMLHttpRequest)\s*\(/g },
  { name: "navigator.sendBeacon()", pattern: /\bnavigator\s*\.\s*sendBeacon\s*\(/g },
  { name: "Node socket connect", pattern: /\b(?:net|tls)\s*\.\s*connect\s*\(/g },
  { name: "UDP socket creation", pattern: /\bdgram\s*\.\s*createSocket\s*\(/g },
  { name: "axios/got/undici request", pattern: new RegExp("\\b(?:axios|got|undici)\\.(?:request|get|post|put|patch|delete)\\s*\\(", "g") },
  { name: "Node HTTP request", pattern: new RegExp("\\b(?:http|https)\\.request\\s*\\(", "g") },
  { name: "Node HTTP/2 connect", pattern: new RegExp("\\bhttp2\\.connect\\s*\\(", "g") },
  { name: "computed import()", pattern: /\bimport\s*\(\s*(?!["'])/g },
  { name: "computed require()", pattern: /\brequire\s*\(\s*(?!["'])/g },
  { name: "createRequire()", pattern: /\bcreateRequire\s*\(/g },
];
const EXPLICIT_HTTP_IMPORTS = /^(?:node:)?(?:http|https|http2|net|tls|dgram|axios|got|undici|ws|websocket|eventsource|xhr2)$/;
const RESTRICTED_RUNTIME_CAPABILITY_IMPORTS = new Set([
  "module", "node:module",
  "process", "node:process",
  "child_process", "node:child_process",
  "vm", "node:vm",
  "worker_threads", "node:worker_threads",
  "cluster", "node:cluster",
  "dns", "node:dns", "dns/promises", "node:dns/promises",
  "inspector", "node:inspector",
]);
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

// Mission Action route graphs are deny-by-default for third-party runtime
// packages. Only the current application infrastructure dependencies are
// reviewed here; adding a new package to these routes requires explicit review.
const REVIEWED_NON_PROVIDER_ROUTE_IMPORTS = new Set([
  // Exact public entrypoints observed in the Mission Action API dependency graph.
  // Do not permit arbitrary private subpaths merely because a package root is reviewed.
  "@supabase/ssr",
  "@supabase/supabase-js",
  "next/server",
  "next/headers",
  "server-only",
]);
const NODE_BUILTIN_NAMES = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const NODE_BUILTIN_ROOTS = new Set([...NODE_BUILTIN_NAMES].map((name) => name.split("/")[0]));

const RESTRICTED_RUNTIME_CAPABILITY_ROOTS = new Set(
  [...RESTRICTED_RUNTIME_CAPABILITY_IMPORTS]
    .map((specifier) => specifier.replace(/^node:/, "").split("/")[0]),
);

function isRestrictedRuntimeCapabilityImport(specifier) {
  const normalized = specifier.replace(/^node:/, "");
  const root = normalized.split("/")[0];
  // Block the root and every subpath, with or without the node: prefix.
  return RESTRICTED_RUNTIME_CAPABILITY_IMPORTS.has(specifier)
    || RESTRICTED_RUNTIME_CAPABILITY_IMPORTS.has(normalized)
    || RESTRICTED_RUNTIME_CAPABILITY_ROOTS.has(root);
}

function isNodeBuiltinSpecifier(specifier) {
  const normalized = specifier.replace(/^node:/, "");
  return NODE_BUILTIN_NAMES.has(normalized)
    || NODE_BUILTIN_ROOTS.has(normalized.split("/")[0]);
}

function externalPackageName(specifier) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) return null;
  if (isNodeBuiltinSpecifier(specifier)) return null;
  if (specifier.startsWith("@/")) return specifier; // unresolved local alias: fail closed
  if (specifier.startsWith("node:")) return specifier; // unknown node: specifier: fail closed
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isReviewedNonProviderImport(specifier) {
  const packageName = externalPackageName(specifier);
  return packageName === null || REVIEWED_NON_PROVIDER_ROUTE_IMPORTS.has(specifier);
}

const GLOBAL_FETCH_PATHS = new Set([
  "fetch",
  "globalThis.fetch",
  "global.fetch",
  "self.fetch",
  "window.fetch",
]);

function findDirectOutboundMatches(source, pattern) {
  // Global RegExp instances have mutable lastIndex. Clone per source file so
  // earlier detector self-tests/scans cannot skip matches in later files.
  const freshPattern = new RegExp(pattern.source, pattern.flags);
  return [...source.matchAll(freshPattern)];
}

const GLOBAL_OBJECT_PATHS = new Set(["globalThis", "global", "self", "window", "process"]);
const DYNAMIC_LOADER_OR_CODE_PATHS = new Set([
  "require", "createRequire", "module.require", "module.constructor._load",
  "process.mainModule.require", "process.getBuiltinModule", "process.binding",
  "process._linkedBinding", "process.dlopen", "eval", "Function",
  "globalThis.require", "global.require", "self.require", "window.require",
  "globalThis.createRequire", "global.createRequire", "self.createRequire", "window.createRequire",
  "globalThis.eval", "global.eval", "self.eval", "window.eval",
  "globalThis.Function", "global.Function", "self.Function", "window.Function",
]);

function sourceScriptKind(filePath) {
  const extension = filePath.toLowerCase().split(".").pop();
  if (["ts", "mts", "cts"].includes(extension)) return ts.ScriptKind.TS;
  if (extension === "tsx") return ts.ScriptKind.TSX;
  if (extension === "jsx") return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function astExpressionPath(node) {
  if (!node) return null;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const parent = astExpressionPath(node.expression);
    return parent ? `${parent}.${node.name.text}` : null;
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression
      && (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))) {
    const parent = astExpressionPath(node.expression);
    return parent ? `${parent}["${node.argumentExpression.text}"]` : null;
  }
  return null;
}

function normalizeExpressionPath(path) {
  return path?.replace(/\["([^"]+)"\]/g, ".$1") ?? null;
}

function resolveAliasedExpressionPath(node, aliases) {
  const path = normalizeExpressionPath(astExpressionPath(node));
  if (!path) return null;
  const [root, ...tail] = path.split(".");
  const replacement = aliases?.get(root);
  return replacement ? [replacement, ...tail].join(".") : path;
}

function isSensitiveAliasPath(path) {
  return Boolean(path) && (
    GLOBAL_OBJECT_PATHS.has(path)
    || GLOBAL_FETCH_PATHS.has(path)
    || DYNAMIC_LOADER_OR_CODE_PATHS.has(path)
    || /^(?:WebSocket|XMLHttpRequest|EventSource)$/.test(path)
    || /^(?:globalThis|global|self|window)\.(?:WebSocket|XMLHttpRequest|EventSource|fetch|require|createRequire|eval|Function)$/.test(path)
    || /^(?:axios|got|undici)\.(?:request|get|post|put|patch|delete)$/.test(path)
    || /^(?:http|https)\.request$/.test(path)
    || path === "http2.connect"
    || /^(?:net|tls)\.connect$/.test(path)
    || path === "dgram.createSocket"
    || path === "navigator.sendBeacon"
  );
}

function outboundExpressionReason(node, aliases = new Map()) {
  const path = resolveAliasedExpressionPath(node, aliases);
  if (!path) return null;

  if (GLOBAL_FETCH_PATHS.has(path)) return "fetch transport reference";
  if (path.endsWith(".call") || path.endsWith(".apply") || path.endsWith(".bind")) {
    const base = path.slice(0, path.lastIndexOf("."));
    if (GLOBAL_FETCH_PATHS.has(base)) return "fetch method escape";
  }
  if (/^(?:axios|got|undici)\.(?:request|get|post|put|patch|delete)$/.test(path)) return "provider HTTP client call";
  if (/^(?:http|https)\.request$/.test(path)) return "Node HTTP request";
  if (path === "http2.connect") return "Node HTTP/2 connect";
  if (/^(?:net|tls)\.connect$/.test(path)) return "Node socket connect";
  if (path === "dgram.createSocket") return "UDP socket creation";
  if (path === "navigator.sendBeacon") return "navigator.sendBeacon";
  return null;
}

function readAstOutboundMarkers(source, filePath = "source.mjs") {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourceScriptKind(filePath),
  );
  const markers = [];
  const seen = new Set();
  const aliases = new Map();
  const add = (node, reason) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const marker = `${reason} at line ${line}`;
    if (!seen.has(marker)) {
      seen.add(marker);
      markers.push(marker);
    }
  };
  const staticString = (node) => Boolean(
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  );

  function visit(node) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const accessPath = resolveAliasedExpressionPath(node, aliases);
      if (isSensitiveAliasPath(accessPath) && !GLOBAL_OBJECT_PATHS.has(accessPath)) {
        add(node, "outbound-capable transport/loader reference");
      }
    }

    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && !staticString(node.arguments[0])) {
        add(node, "computed import()");
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === "require" && !staticString(node.arguments[0])) {
        add(node, "computed require()");
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === "createRequire") {
        add(node, "createRequire()");
      }
      if (ts.isIdentifier(node.expression) && ["eval", "Function"].includes(node.expression.text)) {
        add(node, "dynamic code execution");
      }

      const callPath = resolveAliasedExpressionPath(node.expression, aliases);
      const reason = outboundExpressionReason(node.expression, aliases);
      if (reason) add(node, reason);

      // Reflect.get can recover transport and loader capabilities without a
      // property-access AST node (for example Reflect.get(globalThis, "fetch")).
      // Treat this as a capability escape even when the result is later aliased.
      if (callPath === "Reflect.get" && node.arguments.length >= 2) {
        const target = resolveAliasedExpressionPath(node.arguments[0], aliases);
        const key = node.arguments[1];
        const keyName = staticString(key) ? key.text : null;
        if (GLOBAL_OBJECT_PATHS.has(target) && (
          !keyName || [
            "fetch", "WebSocket", "XMLHttpRequest", "EventSource",
            "require", "createRequire", "eval", "Function",
          ].includes(keyName)
        )) {
          add(node, `Reflect.get global transport/codegen capability (${keyName ?? "computed-key"})`);
        }
      }

      // Object.getOwnPropertyDescriptor(globalThis, "fetch").value is another
      // way to recover a global transport without a global property-access AST
      // node. Flag descriptor access itself, whether or not .value is invoked.
      if (callPath === "Object.getOwnPropertyDescriptor" && node.arguments.length >= 2) {
        const target = resolveAliasedExpressionPath(node.arguments[0], aliases);
        const key = node.arguments[1];
        const keyName = staticString(key) ? key.text : null;
        if (GLOBAL_OBJECT_PATHS.has(target) && (
          !keyName || [
            "fetch", "WebSocket", "XMLHttpRequest", "EventSource",
            "require", "createRequire", "eval", "Function",
          ].includes(keyName)
        )) {
          add(node, `property descriptor exposes global transport/codegen capability (${keyName ?? "computed-key"})`);
        }
      }

      // The plural form returns every own descriptor, including hidden global
      // transports and loaders, so it is sensitive even without a named key.
      if (callPath === "Object.getOwnPropertyDescriptors" && node.arguments.length >= 1) {
        const target = resolveAliasedExpressionPath(node.arguments[0], aliases);
        if (GLOBAL_OBJECT_PATHS.has(target)) {
          add(node, "all global property descriptors expose transport/codegen capabilities");
        }
      }
      if (callPath && /^(?:globalThis|global|self|window)\.(?:fetch|WebSocket|XMLHttpRequest|EventSource)$/.test(callPath)) {
        add(node, "global transport call");
      }
      if (callPath?.endsWith(".require") && !staticString(node.arguments[0])) {
        add(node, "computed require()");
      }
    }

    if (ts.isNewExpression(node) && node.expression) {
      const path = resolveAliasedExpressionPath(node.expression, aliases);
      if (["WebSocket", "EventSource", "XMLHttpRequest", "globalThis.WebSocket", "globalThis.EventSource", "globalThis.XMLHttpRequest", "global.WebSocket", "global.EventSource", "global.XMLHttpRequest", "self.WebSocket", "self.EventSource", "self.XMLHttpRequest", "window.WebSocket", "window.EventSource", "window.XMLHttpRequest"].includes(path)) {
        add(node, "outbound transport constructor");
      }
      if (path === "Function") add(node, "dynamic code execution");
    }

    if (ts.isElementAccessExpression(node) && node.argumentExpression && !staticString(node.argumentExpression)) {
      const base = resolveAliasedExpressionPath(node.expression, aliases);
      if (GLOBAL_OBJECT_PATHS.has(base)) {
        add(node, "computed global property access");
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        const initialPath = resolveAliasedExpressionPath(node.initializer, aliases);
        const reason = outboundExpressionReason(node.initializer, aliases);
        if (reason) add(node, `outbound transport alias (${reason})`);
        if (initialPath && DYNAMIC_LOADER_OR_CODE_PATHS.has(initialPath)) {
          add(node, `dynamic loader/codegen alias (${initialPath})`);
        }
        if (initialPath && (
          isSensitiveAliasPath(initialPath)
          || initialPath === "Reflect"
          || initialPath === "Object"
        )) aliases.set(node.name.text, initialPath);
      } else if (ts.isObjectBindingPattern(node.name)) {
        const base = resolveAliasedExpressionPath(node.initializer, aliases);
        for (const element of node.name.elements) {
          const property = element.propertyName || element.name;
          const propertyName = ts.isIdentifier(property) || ts.isStringLiteral(property) ? property.text : null;
          const localName = element.name.getText(sourceFile);
          const globalCapabilities = ["fetch", "WebSocket", "XMLHttpRequest", "EventSource", "require", "eval", "Function"];
          const processCapabilities = ["binding", "_linkedBinding", "dlopen", "getBuiltinModule", "mainModule"];
          if (GLOBAL_OBJECT_PATHS.has(base) && (
            globalCapabilities.includes(propertyName)
            || (base === "process" && processCapabilities.includes(propertyName))
          )) {
            add(element, `destructured global transport/codegen (${propertyName})`);
            aliases.set(localName, `${base}.${propertyName}`);
          } else if (base === "Reflect" && propertyName === "get") {
            aliases.set(localName, "Reflect.get");
          } else if (base === "Object" && ["getOwnPropertyDescriptor", "getOwnPropertyDescriptors"].includes(propertyName)) {
            aliases.set(localName, `Object.${propertyName}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return markers;
}

test("direct outbound regex scans reset global match state for every source file", () => {
  const detector = DIRECT_OUTBOUND_PATTERNS.find((entry) => entry.name === "fetch()");
  assert.ok(detector, "fetch detector must exist");
  detector.pattern.lastIndex = 0;
  assert.equal(detector.pattern.test("fetch(url)"), true);
  assert.ok(detector.pattern.lastIndex > 0, "self-test advances the shared global RegExp");

  assert.equal(findDirectOutboundMatches("fetch(url)", detector.pattern).length, 1,
    "a fresh scan must find fetch even when the shared RegExp lastIndex was advanced");
  assert.equal(findDirectOutboundMatches("fetch(url)", detector.pattern).length, 1,
    "repeated source scans must return the same result");
});

test("outbound-source detectors recognize representative transport and dynamic-loader escapes", () => {
  const positiveExamples = [
    ["fetch()", "await fetch(url)"],
    ["fetch.call/apply", "fetch.call(globalThis, url)"],
    ["computed global transport access", 'globalThis["fetch"](url)'],
    ["WebSocket/EventSource/XHR constructor", "new WebSocket(url)"],
    ["WebSocket/EventSource/XHR constructor", "new XMLHttpRequest()"],
    ["navigator.sendBeacon()", "navigator.sendBeacon(url, body)"],
    ["Node socket connect", "net.connect(options)"],
    ["Node socket connect", "tls.connect(options)"],
    ["UDP socket creation", 'dgram.createSocket("udp4")'],
    ["axios/got/undici request", "await axios.post(url, body)"],
    ["Node HTTP request", "https.request(options)"],
    ["Node HTTP/2 connect", "http2.connect(authority)"],
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

  for (const specifier of ["node:http", "node:https", "node:http2", "http2", "node:net", "node:tls", "node:dgram", "ws", "websocket", "eventsource", "xhr2"]) {
    assert.equal(EXPLICIT_HTTP_IMPORTS.test(specifier), true, specifier + " is an outbound-capable transport");
  }
  assert.equal(EXPLICIT_HTTP_IMPORTS.test("node:fs"), false);
  for (const specifier of [
    "module", "node:module",
    "process", "node:process",
    "child_process", "node:child_process",
    "vm", "node:vm",
    "worker_threads", "node:worker_threads",
    "cluster", "node:cluster",
    "dns", "node:dns", "dns/promises", "node:dns/promises",
    "inspector", "node:inspector",
  ]) {
    assert.equal(RESTRICTED_RUNTIME_CAPABILITY_IMPORTS.has(specifier), true,
      specifier + " exposes a dynamic loader, child-process, code-generation or worker capability");
  }
  const restrictedSpecifiers = readStaticLocalImportSpecifiers(
    'import { createRequire as makeRequire } from "node:module";\n'
      + 'const { spawn } = require("node:child_process");\n'
      + 'import vm from "node:vm";\n'
      + 'import dns from "node:dns/promises";\n'
      + 'const inspector = require("node:inspector");\n'
      + 'import cluster from "node:cluster";\n'
      + 'import { getBuiltinModule as loadBuiltin } from "node:process";\n'
      + 'const runtimeProcess = require("process");',
  );
  assert.deepEqual(
    restrictedSpecifiers.filter((specifier) => RESTRICTED_RUNTIME_CAPABILITY_IMPORTS.has(specifier)).sort(),
    ["node:child_process", "node:cluster", "node:dns/promises", "node:inspector", "node:module", "node:process", "node:vm", "process"],
    "aliased imports and CommonJS module loading must surface restricted runtime capabilities",
  );
  const specifiers = readStaticLocalImportSpecifiers(
    'import Client from "openai";\\nconst mail = require("resend");',
  );
  assert.deepEqual(specifiers.sort(), ["openai", "resend"]);
  assert.equal(specifiers.every((specifier) => EXPLICIT_PROVIDER_SDK_IMPORTS.has(specifier)), true,
    "known provider SDKs are recognized as outbound-capable dependencies");
});

test("AST outbound analysis rejects sensitive transport references passed through helpers", () => {
  const blockedExamples = [
    'const relay = (callback, value) => callback(value); relay(globalThis.fetch, "/outbound");',
    'const browserGlobal = globalThis; const relay = (callback, value) => callback(value); relay(browserGlobal.fetch, "/outbound");',
    'const runtimeGlobal = globalThis; const handoff = (loader, name) => loader(name); handoff(runtimeGlobal.require, providerPackageName);',
    'const runtimeGlobal = globalThis; const compile = runtimeGlobal.Function; handoff(compile, sourceText);',
  ];
  for (const source of blockedExamples) {
    assert.ok(readAstOutboundMarkers(source).length > 0, source + " must flag a transport/loader passed as a value");
  }

  const allowedExamples = [
    'const payload = { fetch: "field name", destination: "https://example.invalid" };',
    'const metadata = globalThis["metadata"];',
  ];
  for (const source of allowedExamples) {
    assert.deepEqual(readAstOutboundMarkers(source), [], source);
  }
});

test("AST outbound analysis follows aliases of global objects, transports and dynamic loaders", () => {
  const blockedExamples = [
    'const browserGlobal = globalThis; browserGlobal.fetch("/outbound");',
    'const browserGlobal = globalThis; const request = browserGlobal.fetch; request("/outbound");',
    'const runtimeGlobal = globalThis; const request = runtimeGlobal["fetch"]; request("/outbound");',
    'const runtimeGlobal = globalThis; const load = runtimeGlobal.require; load(providerPackageName);',
    'const runtimeGlobal = globalThis; const compile = runtimeGlobal.Function; compile("return fetch(url)")();',
    'const runtimeGlobal = globalThis; const hidden = runtimeGlobal[transportPropertyName];',
  ];
  for (const source of blockedExamples) {
    assert.ok(readAstOutboundMarkers(source).length > 0, source + " must be detected through aliases");
  }
});

test("AST outbound analysis catches aliases and computed transport calls without flagging ordinary database RPCs", () => {
  const blockedExamples = [
    'const request = Reflect.get(globalThis, "fetch"); await request("/outbound");',
    'const runtimeGlobal = globalThis; const request = Reflect["get"](runtimeGlobal, "fetch"); await request("/outbound");',
    'const loader = Reflect.get(globalThis, "require"); loader(providerPackageName);',
    'const compile = Reflect.get(globalThis, "Function"); compile("return 1")();',
    'const request = Object.getOwnPropertyDescriptor(globalThis, "fetch").value; await request("/outbound");',
    'const runtimeGlobal = globalThis; const descriptor = Object.getOwnPropertyDescriptor(runtimeGlobal, "require"); descriptor.value(providerPackageName);',
    'const reflectApi = Reflect; const request = reflectApi.get(globalThis, "fetch"); await request("/outbound");',
    'const objectApi = Object; const descriptor = objectApi.getOwnPropertyDescriptor(globalThis, "require"); descriptor.value(providerPackageName);',
    'const descriptors = Object.getOwnPropertyDescriptors(globalThis); descriptors.fetch.value("/outbound");',
    'const objectApi = Object; const descriptors = objectApi.getOwnPropertyDescriptors(globalThis); descriptors.require.value(providerPackageName);',
    'const key = ["fe", "tch"].join(""); const request = Reflect.get(globalThis, key); await request("/outbound");',
    'const key = ["re", "quire"].join(""); const descriptor = Object.getOwnPropertyDescriptor(globalThis, key); descriptor.value(providerPackageName);',
    'const { get: reflectGet } = Reflect; const request = reflectGet(globalThis, "fetch"); await request("/outbound");',
    'const { getOwnPropertyDescriptor: getDescriptor } = Object; const descriptor = getDescriptor(globalThis, "require"); descriptor.value(providerPackageName);',
    'const { getOwnPropertyDescriptors: getDescriptors } = Object; getDescriptors(globalThis).fetch.value("/outbound");',
    'const request = globalThis.fetch; await request("/outbound");',
    'const request = globalThis["fetch"]; await request("/outbound");',
    'const { fetch: request } = globalThis; await request("/outbound");',
    'globalThis.fetch.call(globalThis, "/outbound");',
    'const request = fetch.bind(globalThis); await request("/outbound");',
    'new WebSocket("wss://example.invalid");',
    'new XMLHttpRequest();',
    'navigator.sendBeacon("/outbound", "payload");',
    'net.connect({ host: "example.invalid", port: 443 });',
    'tls.connect({ host: "example.invalid", port: 443 });',
    'dgram.createSocket("udp4");',
    'http2.connect("https://example.invalid");',
    'const connectHttp2 = http2.connect; connectHttp2(authority);',
    'process.binding("tcp_wrap");',
    'const bindInternal = process.binding; bindInternal("tcp_wrap");',
    'process._linkedBinding("http2");',
    'process.dlopen(module, nativeAddonPath);',
    'const loadNative = process.dlopen; loadNative(module, nativeAddonPath);',
    'const runtimeProcess = process; runtimeProcess.dlopen(module, nativeAddonPath);',
    'await import(resolveProviderModuleName());',
    'require(resolveProviderPackageName());',
    'const localRequire = createRequire(import.meta.url);',
    'const load = require; load(resolveProviderPackageName());',
    'const { binding: bindInternal } = process; bindInternal("tcp_wrap");',
    'const { _linkedBinding: loadInternal } = process; loadInternal("http2");',
    'const { dlopen: loadNative } = process; loadNative(module, nativeAddonPath);',
    'const { getBuiltinModule } = process; getBuiltinModule("http");',
    'const { mainModule } = process; mainModule.require("node:http");',
    'const { mainModule: main } = process; main.require("node:https");',
    'const { require: load } = globalThis; load(providerPackageName);',
    'module.require(resolveProviderPackageName());',
    'process.mainModule.require("node:http");',
    'const loadFromMainModule = process.mainModule.require; loadFromMainModule("node:https");',
    'module.constructor._load("node:http");',
    'const builtinLoader = module.constructor._load; builtinLoader("node:https");',
    'process.getBuiltinModule("http");',
    'const getBuiltin = process.getBuiltinModule; getBuiltin("https");',
    'const compile = Function; compile("return fetch(url)")();',
    'eval("fetch(url)")',
    'new Function("return fetch(url)")()',
    'globalThis[transportPropertyName](url);',
    'const hidden = globalThis[transportPropertyName];',
  ];

  for (const source of blockedExamples) {
    assert.ok(readAstOutboundMarkers(source).length > 0, source + " must be detected");
  }

  const allowedExamples = [
    'const result = await supabase.from("missions").select("*");',
    'const result = await client.rpc("claim_agent_execution_dispatch", { p_execution_id: id });',
    'const payload = { fetch: "metadata", destination: "https://example.invalid" };',
    'const fs = await import("./trusted-local.mjs");',
    'const metadata = globalThis["metadata"];',
  ];
  for (const source of allowedExamples) {
    assert.deepEqual(readAstOutboundMarkers(source).filter(marker => marker !== "computed import()"), [], source);
  }
});

test("restricted runtime capability imports deny every subpath with or without node: prefix", () => {
  for (const specifier of [
    "process",
    "node:process",
    "process/promises",
    "node:process/promises",
    "module",
    "node:module",
    "module/internal",
    "node:module/internal",
    "child_process",
    "node:child_process",
    "child_process/promises",
    "node:child_process/promises",
    "inspector",
    "node:inspector",
    "inspector/promises",
    "node:inspector/promises",
    "dns/promises",
    "node:dns/promises",
    "worker_threads",
    "node:worker_threads",
  ]) {
    assert.equal(isRestrictedRuntimeCapabilityImport(specifier), true, specifier);
  }

  for (const specifier of [
    "crypto",
    "node:crypto",
    "fs/promises",
    "node:fs/promises",
    "path",
    "node:path",
  ]) {
    assert.equal(isRestrictedRuntimeCapabilityImport(specifier), false, specifier);
  }
});

test("Mission Action dependency policy allows reviewed public entrypoints, not package-private subpaths", () => {
  for (const specifier of [
    "@supabase/supabase-js",
    "@supabase/ssr",
    "next/server",
    "next/headers",
    "server-only",
    "node:fs/promises",
    "fs/promises",
    "node:crypto",
  ]) {
    assert.equal(isReviewedNonProviderImport(specifier), true, specifier);
  }

  for (const specifier of [
    "next",
    "react",
    "react-dom",
    "next/dist/compiled/undici",
    "next/dist/server/web/spec-extension/request",
    "@supabase/supabase-js/dist/module/index.js",
    "@supabase/ssr/dist/main/index.js",
    "react-dom/cjs/react-dom-server.node.production.js",
    "openai",
    "@anthropic-ai/sdk",
    "resend",
    "axios",
    "undici",
    "some-unknown-provider-sdk",
    "@/lib/not-found-module",
    "node:not-a-real-builtin",
  ]) {
    assert.equal(isReviewedNonProviderImport(specifier), false, specifier);
  }
});

test("Mission Action API dependency graphs cannot bypass the trusted external-effect boundary", async () => {
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
        if (isRestrictedRuntimeCapabilityImport(specifier)) {
          violations.push({ route, module: moduleName, marker: `restricted runtime capability import: ${specifier}` });
        }
        if (EXPLICIT_PROVIDER_SDK_IMPORTS.has(specifier)) {
          violations.push({ route, module: moduleName, marker: `provider SDK import: ${specifier}` });
        }
        const resolvedLocalImport = await resolveLocalSourceImport(specifier, modulePath);
        const packageName = externalPackageName(specifier);
        if (!resolvedLocalImport && packageName !== null
            && !REVIEWED_NON_PROVIDER_ROUTE_IMPORTS.has(specifier)) {
          violations.push({
            route,
            module: moduleName,
            marker: `unreviewed third-party package import: ${specifier}`,
          });
        }
      }

      for (const { name, pattern } of DIRECT_OUTBOUND_PATTERNS) {
        for (const match of findDirectOutboundMatches(source, pattern)) {
          const line = source.slice(0, match.index).split("\n").length;
          violations.push({ route, module: moduleName, marker: `${name} at line ${line}` });
        }
      }

      for (const marker of readAstOutboundMarkers(source, modulePath)) {
        violations.push({ route, module: moduleName, marker: `AST ${marker}` });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    "Mission Action routes must not add direct outbound calls, provider SDKs, dynamic loaders, child processes, dynamic code or worker capabilities in their statically reachable local source graph; provider I/O belongs behind the trusted JIT adapter. Read-only Research is inventoried separately.",
  );
});



async function listRuntimeSourceFiles(directory) {
  const ignoredDirectories = new Set(["node_modules", ".next", ".git", "test", "tests", "coverage", "dist", "build"]);
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) return [];
      return listRuntimeSourceFiles(path);
    }
    return entry.isFile() && LOCAL_SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  }));
  return nested.flat();
}

test("server-action entrypoints are explicitly inventoried and workspace creation cannot bypass JIT dispatch", async () => {
  const sourceFiles = await listRuntimeSourceFiles(webRoot);
  const serverActionEntrypoints = [];
  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    if (/^\s*["']use server["'];?\s*(?:\/\/.*)?$/m.test(source)) {
      serverActionEntrypoints.push(relative(webRoot, sourceFile).replace(/\\/g, "/"));
    }
  }

  const reviewedServerActionInventory = new Map([
    ["app/app/missions/new/page.tsx", {
      effect: "AUTHENTICATED_MISSION_CREATION_RPC",
      rationale: "Creates a mission through a user-session Supabase client and the atomic create_mission_with_actions RPC. This is workspace data mutation, not external Mission Action dispatch.",
    }],
  ]);
  assert.deepEqual(
    serverActionEntrypoints.sort(),
    [...reviewedServerActionInventory.keys()].sort(),
    "every new Next.js server action must be classified and reviewed before it can enter the source tree",
  );

  const missionCreatePagePath = join(webRoot, "app", "app", "missions", "new", "page.tsx");
  const page = await readFile(missionCreatePagePath, "utf8");
  const repositoryPath = join(webRoot, "lib", "supabase", "mission-repository.ts");
  const serverClientPath = join(webRoot, "lib", "supabase", "server.ts");
  const migrationPath = join(webRoot, "..", "..", "supabase", "migrations", "20261002114358_w26_atomic_mission_creation.sql");
  const [repository, serverClient, migration] = await Promise.all([
    readFile(repositoryPath, "utf8"),
    readFile(serverClientPath, "utf8"),
    readFile(migrationPath, "utf8"),
  ]);

  assert.match(page, /async function createMission\(formData: FormData\)/);
  assert.match(page, /"use server"/);
  assert.match(page, /createSupabaseMissionRepository\(\)/);
  assert.match(page, /repository\.createMission!\(/);
  assert.match(repository, /await supabase\.auth\.getUser\(\)/,
    "mission creation must derive identity from the authenticated cookie-bound session");
  assert.match(repository, /const workspaceId = await ownedWorkspace\(supabase, user\.id\)/,
    "the mission repository must derive the workspace from the authenticated user");
  assert.match(repository, /supabase\.rpc\("create_mission_with_actions"/,
    "mission and its initial actions must be created through the atomic RPC");
  assert.match(serverClient, /createServerClient\(supabaseUrl, supabasePublishableKey/);
  assert.doesNotMatch(serverClient, /SUPABASE_SERVICE_ROLE_KEY/,
    "the workspace mission-create action must not use the privileged service-role client");
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /where w\.id = p_workspace_id\s+and w\.owner_id = v_user_id/,
    "the RPC must bind the submitted workspace to the authenticated owner");
  assert.match(migration, /revoke all on function public\.create_mission_with_actions[\s\S]*?from public, anon/i);
  assert.match(migration, /grant execute on function public\.create_mission_with_actions[\s\S]*?to authenticated/i);

  const reachable = await collectReachableLocalSourceModules(missionCreatePagePath);
  const dispatchOnlyModules = new Set([
    join(webRoot, "lib", "mission-authority", "persistent-dispatch-gateway.mjs"),
    join(webRoot, "lib", "mission-authority", "mission-action-worker-boundary.mjs"),
    join(webRoot, "lib", "mission-authority", "provider-adapter-registry.mjs"),
  ]);
  assert.deepEqual(
    [...reachable].filter((modulePath) => dispatchOnlyModules.has(modulePath)).map((modulePath) => relative(webRoot, modulePath).replace(/\\/g, "/")),
    [],
    "workspace mission creation is not a Mission Action dispatch path and may not import the JIT dispatcher/provider registry",
  );
});

test("every non-Mission outbound API route is explicitly classified in the outbound-effect inventory", async () => {
  const apiRoot = join(webRoot, "app", "api");
  const routeFiles = await listApiRouteFiles(apiRoot);
  const classifications = new Map([
    ["ai/diagnostics/route.ts", "OPENAI_MODEL_DIAGNOSTICS"],
    ["ai/plan/route.ts", "OPENAI_AUTHENTICATED_PLANNING"],
    ["ai/plan/anonymous/route.ts", "OPENAI_ANONYMOUS_PLANNING_AND_QUOTA_RPC"],
    ["auth/password-policy/route.ts", "PWNED_PASSWORDS_RANGE_LOOKUP"],
    ["business/invitations/route.ts", "RESEND_WORKSPACE_INVITATION_EMAIL"],
    ["missions/[id]/research/route.ts", "BOUNDED_READ_ONLY_RESEARCH_AND_TRUSTED_WORKER"],
  ]);
  const observed = [];
  const violations = [];

  // Every inventory row must carry an explicit review rationale. This keeps
  // shared-helper/callback effects reviewable without pretending a route-graph
  // scanner can prove runtime mediation. A classification alone is not enough.
  const classificationEvidence = new Map([
    ["ai/diagnostics/route.ts", {
      effect: "OPENAI_MODEL_DIAGNOSTICS",
      rationale: "Explicit non-mutating provider connectivity/model lookup; not Mission Action dispatch.",
    }],
    ["ai/plan/route.ts", {
      effect: "OPENAI_AUTHENTICATED_PLANNING",
      rationale: "Authenticated AI draft generation with quota controls; does not execute a Mission Action.",
    }],
    ["ai/plan/anonymous/route.ts", {
      effect: "OPENAI_ANONYMOUS_PLANNING_AND_QUOTA_RPC",
      rationale: "Anonymous draft generation and quota accounting; external provider spend is separate from Mission Action dispatch.",
    }],
    ["auth/password-policy/route.ts", {
      effect: "PWNED_PASSWORDS_RANGE_LOOKUP",
      rationale: "Password-compromise range lookup transmits only a SHA-1 prefix; read-only security lookup, not Mission Action dispatch.",
    }],
    ["business/invitations/route.ts", {
      effect: "RESEND_WORKSPACE_INVITATION_EMAIL",
      rationale: "Workspace-admin invitation email is a separately authorized email workflow, outside Mission Action dispatch.",
    }],
    ["missions/[id]/research/route.ts", {
      effect: "BOUNDED_READ_ONLY_RESEARCH_AND_TRUSTED_WORKER",
      rationale: "Bounded read-only Research provider request plus authenticated internal worker callbacks; neither grants external Mission Action authority.",
    }],
  ]);

  assert.deepEqual(
    [...classifications.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [...classificationEvidence.entries()].map(([route, evidence]) => [route, evidence.effect]).sort(([a], [b]) => a.localeCompare(b)),
    "each inventoried route must have exactly one explicit effect classification and reviewed rationale; stale, missing, or unexplained inventory entries must fail",
  );

  for (const routeFile of routeFiles) {
    const route = relative(apiRoot, routeFile).replace(/\\/g, "/");
    const isMissionActionRoute = route.startsWith("agent-executions/")
      || route.startsWith("internal/agent-executions/")
      || (route.startsWith("missions/") && !route.startsWith("missions/[id]/research/"));
    if (isMissionActionRoute) continue; // governed by the stricter JIT source-graph test

    const reachable = await collectReachableLocalSourceModules(routeFile);
    const markers = [];

    for (const modulePath of reachable) {
      const source = await readFile(modulePath, "utf8");
      const moduleName = relative(webRoot, modulePath).replace(/\\/g, "/");

      for (const { name, pattern } of DIRECT_OUTBOUND_PATTERNS) {
        for (const match of findDirectOutboundMatches(source, pattern)) {
          const line = source.slice(0, match.index).split("\n").length;
          markers.push(`${name} in ${moduleName}:${line}`);
        }
      }

      for (const marker of readAstOutboundMarkers(source, modulePath)) {
        markers.push(`AST ${marker} in ${moduleName}`);
      }

      for (const specifier of readStaticLocalImportSpecifiers(source)) {
        if (EXPLICIT_HTTP_IMPORTS.test(specifier)) markers.push(`transport import ${specifier} in ${moduleName}`);
        if (EXPLICIT_PROVIDER_SDK_IMPORTS.has(specifier)) markers.push(`provider SDK import ${specifier} in ${moduleName}`);
      }
    }

    if (markers.length > 0) {
      observed.push(route);
      if (!classifications.has(route)) {
        violations.push({ route, reason: "outbound-capable source graph has no explicit inventory classification", markers });
      }
    }
  }

  const actualApiRoutes = new Set(routeFiles.map((routeFile) =>
    relative(apiRoot, routeFile).replace(/\\/g, "/")
  ));
  for (const route of classifications.keys()) {
    if (!actualApiRoutes.has(route)) {
      violations.push({ route, reason: `inventory classification points to a missing API route: ${classifications.get(route)}` });
    }
  }

  assert.deepEqual(
    observed.filter((route) => !classifications.has(route)).sort(),
    [],
    "every directly detectable outbound effect in a non-Mission Action API graph must match an evidence-backed inventory entry; inventory entries for shared-helper/callback effects require an explicit effect classification and rationale, but this source scan is not runtime mediation proof",
  );
  assert.deepEqual(violations, []);
});


test("non-API auth route handlers and middleware are explicitly inventoried as separate identity-provider effects", async () => {
  const appRoot = join(webRoot, "app");
  const allRouteFiles = await listApiRouteFiles(appRoot);
  const nonApiRoutes = allRouteFiles
    .filter((routeFile) => !relative(appRoot, routeFile).replace(/\\/g, "/").startsWith("api/"))
    .map((routeFile) => relative(appRoot, routeFile).replace(/\\/g, "/"))
    .sort();

  const reviewedIdentityRouteInventory = new Map([
    ["auth/callback/route.ts", "SUPABASE_AUTH_CODE_EXCHANGE_OR_OTP_VERIFICATION"],
    ["auth/confirm/route.ts", "SUPABASE_AUTH_OTP_VERIFICATION"],
  ]);
  assert.deepEqual(
    nonApiRoutes,
    [...reviewedIdentityRouteInventory.keys()].sort(),
    "new non-API Next.js route handlers must be explicitly inventoried before they can introduce an unreviewed runtime entrypoint",
  );

  const callback = await readFile(join(appRoot, "auth", "callback", "route.ts"), "utf8");
  const confirm = await readFile(join(appRoot, "auth", "confirm", "route.ts"), "utf8");
  const middleware = await readFile(join(webRoot, "middleware.ts"), "utf8");

  assert.ok(callback.includes("supabase.auth.exchangeCodeForSession(code)"),
    "the callback's PKCE exchange is an external identity-provider effect");
  assert.ok(callback.includes("supabase.auth.verifyOtp("),
    "the callback's token-hash path is an external identity-provider effect");
  assert.ok(confirm.includes("supabase.auth.verifyOtp("),
    "the confirmation route's OTP verification is an external identity-provider effect");

  assert.ok(middleware.includes("export async function middleware("));
  assert.ok(middleware.includes("supabase.auth.getUser()"),
    "middleware refreshes/verifies identity through Supabase Auth and is a runtime egress entrypoint");
  assert.ok(middleware.includes('"/app/:path*"'));
  assert.ok(middleware.includes('"/auth/:path*"'),
    "the reviewed middleware scope must remain explicit");
  assert.equal(middleware.includes("mission-authority/"), false,
    "identity middleware must not become a Mission Action dispatch path");

  // These are separate identity/session workflows, not Mission Action JIT
  // dispatch. Their Supabase SDK transport is external and must not be counted
  // as proof that universal outbound mediation has been established.
  assert.deepEqual(
    [...reviewedIdentityRouteInventory.entries()],
    [
      ["auth/callback/route.ts", "SUPABASE_AUTH_CODE_EXCHANGE_OR_OTP_VERIFICATION"],
      ["auth/confirm/route.ts", "SUPABASE_AUTH_OTP_VERIFICATION"],
    ],
  );
});

import { readFile, readdir, stat } from "node:fs/promises";
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
          if (GLOBAL_OBJECT_PATHS.has(base) && ["fetch", "WebSocket", "XMLHttpRequest", "EventSource", "require", "eval", "Function"].includes(propertyName)) {
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
      + 'import cluster from "node:cluster";',
  );
  assert.deepEqual(
    restrictedSpecifiers.filter((specifier) => RESTRICTED_RUNTIME_CAPABILITY_IMPORTS.has(specifier)).sort(),
    ["node:child_process", "node:cluster", "node:dns/promises", "node:inspector", "node:module", "node:vm"],
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
        if (RESTRICTED_RUNTIME_CAPABILITY_IMPORTS.has(specifier)) {
          violations.push({ route, module: moduleName, marker: `restricted runtime capability import: ${specifier}` });
        }
        if (EXPLICIT_PROVIDER_SDK_IMPORTS.has(specifier)) {
          violations.push({ route, module: moduleName, marker: `provider SDK import: ${specifier}` });
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

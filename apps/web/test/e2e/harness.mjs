import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

// The one Supabase project this repository may ever touch remotely. The
// full-loop harness never targets it: mission history there is append-only and
// cannot be removed, so nothing the loop creates could be cleaned up.
export const DEVELOPMENT_PROJECT_REF = "mrwmmbytcymqgwvcoywd";
export const OPT_IN_MODE = "disposable-full-loop";
export const PROJECT_ID_PATTERN = /^zavqera-e2e-[a-z0-9-]{1,40}$/;
export const MARKER_FILE = "ZAVQERA_E2E_DISPOSABLE";
export const SCHEMA_DUMP_PATTERN = /^\d{14}_development_schema\.sql$/;
export const REPO_MIGRATION_SOURCE = "repo-migrations";
export const E2E_COMPAT_MIGRATION_NAME = "20260921180005_e2e_historical_auth_compat.sql";
const E2E_EXCLUDED_SERVICES = "studio,imgproxy,realtime,storage-api,postgres-meta,edge-runtime,logflare,vector,supavisor";
export const DEFAULT_BASE_URL = "http://127.0.0.1:3210";
export const LEDGER_LIMIT = 64;
export const LEDGER_KINDS = ["user", "mission", "action", "verification", "outcome"];
export const CLI_PROJECT_LABEL = "com.supabase.cli.project";

// Privileged or remote credentials are refused outright so that no browser,
// app server or CLI call made by the harness can act with more than a
// publishable key and a user's own session.
export const FORBIDDEN_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
];

// The previous harness ran against Development with pre-created users and left
// provenance-protected fixtures behind. Its configuration is rejected so it
// cannot be mistaken for a supported mode.
export const LEGACY_ENV = [
  "ZAVQERA_E2E_USER_A_EMAIL",
  "ZAVQERA_E2E_USER_A_PASSWORD",
  "ZAVQERA_E2E_USER_B_EMAIL",
  "ZAVQERA_E2E_USER_B_PASSWORD",
];

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSAFE_PATH_CHARACTERS = /["%&|<>^`$;\r\n]/;

export class HarnessBlockedError extends Error {
  constructor(reasons) {
    super(`E2E harness BLOCKED before any mutation:\n- ${reasons.join("\n- ")}`);
    this.name = "HarnessBlockedError";
    this.reasons = reasons;
  }
}

export class CleanupNotVerifiedError extends Error {
  constructor(message) {
    super(`E2E CLEANUP NOT VERIFIED: ${message}`);
    this.name = "CleanupNotVerifiedError";
  }
}

export function isLoopbackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  return LOOPBACK_HOSTS.has(url.hostname);
}

export function referencesRemoteSupabase(value) {
  if (typeof value !== "string") return false;
  const lower = value.toLowerCase();
  return lower.includes(DEVELOPMENT_PROJECT_REF) || /\.supabase\.(co|in|com|net)\b/.test(lower);
}

function normaliseUrl(value) {
  return String(value).replace(/\/+$/, "");
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Every check that can be made without running anything. A non-empty
 * `reasons` list means the run must stop before any process is started.
 */
export function checkStaticPreconditions(env, { repoRoot, fsApi = { existsSync, readFileSync, readdirSync, statSync } } = {}) {
  const reasons = [];

  if (env.ZAVQERA_E2E_MODE !== OPT_IN_MODE) {
    reasons.push(`Set ZAVQERA_E2E_MODE=${OPT_IN_MODE} to opt in to the disposable full-loop run.`);
  }

  const forbidden = FORBIDDEN_ENV.filter((name) => env[name]);
  if (forbidden.length) {
    reasons.push(`Unset privileged or remote credentials before running: ${forbidden.join(", ")}.`);
  }

  const legacy = LEGACY_ENV.filter((name) => env[name]);
  if (legacy.length) {
    reasons.push(`The Development pre-created-user mode was removed because its fixtures cannot be cleaned up. Unset: ${legacy.join(", ")}.`);
  }

  if (env.NEXT_PUBLIC_SUPABASE_URL && !isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
    reasons.push("NEXT_PUBLIC_SUPABASE_URL points at a non-loopback project. Unset it; the harness derives the disposable stack URL itself.");
  }

  const baseURL = env.ZAVQERA_E2E_BASE_URL || DEFAULT_BASE_URL;
  let port = null;
  if (!isLoopbackUrl(baseURL)) {
    reasons.push("ZAVQERA_E2E_BASE_URL must be an http loopback URL such as http://127.0.0.1:3210.");
  } else {
    const url = new URL(baseURL);
    if (!url.port || url.pathname !== "/" || url.search || url.hash) {
      reasons.push("ZAVQERA_E2E_BASE_URL must be an origin with an explicit port and no path.");
    } else {
      port = Number(url.port);
    }
  }

  const workdir = env.ZAVQERA_E2E_SUPABASE_WORKDIR;
  const migrationSource = env.ZAVQERA_E2E_MIGRATION_SOURCE === REPO_MIGRATION_SOURCE
    ? REPO_MIGRATION_SOURCE
    : "development-schema";
  let projectId = null;
  if (!workdir) {
    reasons.push("Set ZAVQERA_E2E_SUPABASE_WORKDIR to the dedicated disposable Supabase workdir (see apps/web/README.md).");
  } else if (!path.isAbsolute(workdir)) {
    reasons.push("ZAVQERA_E2E_SUPABASE_WORKDIR must be an absolute path.");
  } else if (UNSAFE_PATH_CHARACTERS.test(workdir)) {
    reasons.push("ZAVQERA_E2E_SUPABASE_WORKDIR contains characters the harness refuses to pass to a command.");
  } else {
    const resolved = path.resolve(workdir);
    let isDirectory = false;
    try {
      isDirectory = fsApi.statSync(resolved).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      reasons.push("ZAVQERA_E2E_SUPABASE_WORKDIR does not exist or is not a directory.");
    } else if (repoRoot && (isInside(resolved, path.resolve(repoRoot)) || isInside(path.resolve(repoRoot), resolved))) {
      reasons.push("ZAVQERA_E2E_SUPABASE_WORKDIR must be outside this repository checkout and must not contain it.");
    } else {
      const configPath = path.join(resolved, "supabase", "config.toml");
      const config = fsApi.existsSync(configPath) ? String(fsApi.readFileSync(configPath, "utf8")) : null;
      const match = config?.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
      if (!config) {
        reasons.push("The disposable workdir has no supabase/config.toml.");
      } else if (!match || !PROJECT_ID_PATTERN.test(match[1])) {
        reasons.push("supabase/config.toml project_id must match zavqera-e2e-<lowercase-suffix>.");
      } else if (referencesRemoteSupabase(config)) {
        reasons.push("supabase/config.toml references a hosted Supabase project.");
      } else {
        projectId = match[1];
      }

      const markerPath = path.join(resolved, MARKER_FILE);
      const marker = fsApi.existsSync(markerPath) ? String(fsApi.readFileSync(markerPath, "utf8")).trim() : null;
      if (projectId && marker !== projectId) {
        projectId = null;
        reasons.push(`The workdir must contain a ${MARKER_FILE} file whose only content is its project_id. This is the operator's explicit consent that all of its local data may be destroyed.`);
      }

      let migrations = [];
      try {
        migrations = fsApi.readdirSync(path.join(resolved, "supabase", "migrations"))
          .filter((name) => name.endsWith(".sql"))
          .sort();
      } catch {
        migrations = [];
      }

      if (migrationSource === REPO_MIGRATION_SOURCE) {
        let repositoryMigrations = [];
        try {
          repositoryMigrations = fsApi.readdirSync(path.join(repoRoot, "supabase", "migrations"))
            .filter((name) => name.endsWith(".sql"))
            .sort();
        } catch {
          repositoryMigrations = [];
        }
        const repoComparable = migrations.filter((name) => name !== E2E_COMPAT_MIGRATION_NAME);
        const compatCount = migrations.filter((name) => name === E2E_COMPAT_MIGRATION_NAME).length;
        if (!repositoryMigrations.length
            || compatCount !== 1
            || repoComparable.length !== repositoryMigrations.length
            || repoComparable.some((name, index) => name !== repositoryMigrations[index])) {
          projectId = null;
          reasons.push("repo-migrations mode requires the repository migration set plus exactly one disposable historical-auth compatibility migration.");
        }
      } else if (migrations.length !== 1 || !SCHEMA_DUMP_PATTERN.test(migrations[0])) {
        projectId = null;
        reasons.push("supabase/migrations must contain exactly one file, <timestamp>_development_schema.sql, created from the Development schema.");
      }

      if (fsApi.existsSync(path.join(resolved, "supabase", ".temp", "project-ref"))) {
        projectId = null;
        reasons.push("The disposable workdir is linked to a hosted project (supabase/.temp/project-ref exists). Use an unlinked workdir.");
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    plan: reasons.length === 0 ? { workdir: path.resolve(workdir), projectId, baseURL: normaliseUrl(baseURL), port, migrationSource } : null,
  };
}

function decodeJwtRole(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

/**
 * Validates `supabase status -o json` output. Only the API URL and the
 * publishable key are kept; nothing from the status payload is ever echoed,
 * because it also contains the local secret keys.
 */
export function validateStackStatus(raw, env = {}) {
  const reasons = [];
  let status;
  try {
    const text = typeof raw === "string" ? raw.slice(raw.indexOf("{")) : null;
    status = typeof raw === "string" ? JSON.parse(text) : raw;
  } catch {
    status = null;
  }
  if (!status || typeof status !== "object") {
    return { ok: false, reasons: ["supabase status did not return JSON."], target: null };
  }

  const apiUrl = typeof status.API_URL === "string" ? normaliseUrl(status.API_URL) : "";
  const publishableKey = typeof status.PUBLISHABLE_KEY === "string" && status.PUBLISHABLE_KEY
    ? status.PUBLISHABLE_KEY
    : typeof status.ANON_KEY === "string" ? status.ANON_KEY : "";
  const serviceRoleKey = typeof status.SERVICE_ROLE_KEY === "string" && status.SERVICE_ROLE_KEY
    ? status.SERVICE_ROLE_KEY : "";

  if (!isLoopbackUrl(apiUrl) || referencesRemoteSupabase(apiUrl)) {
    reasons.push("The disposable stack API_URL is not a loopback http URL.");
  }
  if (!publishableKey) {
    reasons.push("The disposable stack reported no publishable key.");
  } else {
    if (publishableKey.startsWith("sb_secret_")) reasons.push("The reported publishable key is a secret key.");
    if (publishableKey === status.SECRET_KEY || publishableKey === status.SERVICE_ROLE_KEY) {
      reasons.push("The reported publishable key equals a privileged key.");
    }
    const role = decodeJwtRole(publishableKey);
    if (role !== undefined && role !== "anon") reasons.push("The reported publishable key is not an anon-role key.");
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL && normaliseUrl(env.NEXT_PUBLIC_SUPABASE_URL) !== apiUrl) {
    reasons.push("NEXT_PUBLIC_SUPABASE_URL does not match the disposable stack. Unset it.");
  }
  if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== publishableKey) {
    reasons.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY does not match the disposable stack. Unset it.");
  }

  if (!serviceRoleKey) reasons.push("The disposable stack reported no service-role key.");
  return { ok: reasons.length === 0, reasons, target: reasons.length === 0 ? { apiUrl, publishableKey, serviceRoleKey } : null };
}

/**
 * Exact-id record of everything a run creates. Bounded so a loop can never
 * silently create an unbounded number of fixtures.
 */
export function createFixtureLedger({ runId, limit = LEDGER_LIMIT, onChange } = {}) {
  if (typeof runId !== "string" || !/^[a-z0-9-]{6,64}$/.test(runId)) {
    throw new Error("A fixture ledger needs a lowercase run id.");
  }
  const entries = [];
  const seen = new Set();
  return {
    runId,
    record(kind, id) {
      if (!LEDGER_KINDS.includes(kind)) throw new Error(`Unknown fixture kind: ${kind}`);
      if (typeof id !== "string" || !UUID.test(id)) throw new Error(`Fixture ${kind} id must be a UUID.`);
      const key = `${kind}:${id.toLowerCase()}`;
      if (seen.has(key)) return;
      if (entries.length >= limit) throw new Error(`Fixture ledger limit of ${limit} reached; refusing to create more.`);
      seen.add(key);
      entries.push({ kind, id: id.toLowerCase() });
      onChange?.(this.toJSON());
    },
    entries() {
      return entries.map((entry) => ({ ...entry }));
    },
    toJSON() {
      return { runId, limit, entries: entries.map((entry) => ({ ...entry })) };
    },
  };
}

export function writeLedgerFile(filePath, ledgerJson) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(ledgerJson, null, 2)}\n`);
}

export function readLedgerFile(filePath) {
  if (!filePath || !existsSync(filePath)) return { entries: [] };
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return Array.isArray(parsed.entries) ? parsed : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

/**
 * Runs `body`, then always runs `cleanup`. A cleanup failure is never hidden,
 * even when the body passed, and a body failure is never replaced by it.
 */
export async function runWithGuaranteedCleanup(body, cleanup) {
  let result;
  let bodyError;
  let cleanupError;
  try {
    result = await body();
  } catch (error) {
    bodyError = error;
  }
  try {
    await cleanup();
  } catch (error) {
    cleanupError = error;
  }
  if (bodyError && cleanupError) {
    throw new AggregateError([bodyError, cleanupError], `E2E failed and cleanup failed: ${cleanupError.message}`);
  }
  if (cleanupError) throw cleanupError;
  if (bodyError) throw bodyError;
  return result;
}

/**
 * Runs a fixed executable without a shell. Output is captured and never
 * printed: `supabase start` and `supabase status` include local secret keys.
 */
export function createCommandRunner({ spawnSyncImpl = spawnSync, env = process.env } = {}) {
  const safeEnv = { ...env };
  for (const name of FORBIDDEN_ENV) delete safeEnv[name];
  return function run(command, args, { timeoutMs = 600_000 } = {}) {
    if (command !== "supabase" && command !== "docker") throw new Error(`Refusing to run ${command}.`);
    const result = spawnSyncImpl(command, args, {
      env: safeEnv,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return {
      status: typeof result.status === "number" ? result.status : -1,
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
      missing: result.error?.code === "ENOENT",
    };
  };
}

function redactDiagnostic(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-24)
    .join("\n")
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, "$1REDACTED$2")
    .replace(/eyJ[A-Za-z0-9_-]{20,}/g, "REDACTED")
    .replace(/sb_[A-Za-z0-9_-]{20,}/g, "REDACTED")
    .replace(/[A-Za-z0-9_-]{96,}/g, "REDACTED");
}

function supabaseArgs(plan, ...args) {
  return [...args, "--workdir", plan.workdir];
}

export function checkToolAvailability(run) {
  const reasons = [];
  const cli = run("supabase", ["--version"], { timeoutMs: 60_000 });
  if (cli.status !== 0) reasons.push("The native `supabase` CLI executable is not available on PATH.");
  const docker = run("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 60_000 });
  if (docker.status !== 0) reasons.push("Docker is not available, so stack teardown could not be verified.");
  return reasons;
}

/** Proof of cleanup: Docker reports no container or volume for the project. */
export function verifyStackDestroyed(plan, run) {
  const filter = `label=${CLI_PROJECT_LABEL}=${plan.projectId}`;
  const containers = run("docker", ["ps", "-aq", "--filter", filter], { timeoutMs: 60_000 });
  const volumes = run("docker", ["volume", "ls", "-q", "--filter", filter], { timeoutMs: 60_000 });
  if (containers.status !== 0 || volumes.status !== 0) {
    throw new CleanupNotVerifiedError(`Docker could not be queried for ${plan.projectId}. Run: supabase stop --no-backup --workdir "${plan.workdir}"`);
  }
  if (containers.stdout.trim() || volumes.stdout.trim()) {
    throw new CleanupNotVerifiedError(`Containers or volumes labelled ${plan.projectId} still exist. Run: supabase stop --no-backup --workdir "${plan.workdir}" and remove them with docker.`);
  }
}

export function destroyStack(plan, run) {
  // A non-zero stop (for example "not running") is not itself a failure: the
  // Docker label query below is the evidence that nothing remains.
  run("supabase", supabaseArgs(plan, "stop", "--no-backup"));
  verifyStackDestroyed(plan, run);
}

/**
 * Cleanup preflight: destroy and verify first, so a run only ever starts on an
 * empty stack whose teardown has just been proven to work.
 */
export function startFreshStack(plan, run, env = {}) {
  destroyStack(plan, run);
  const start = run(
    "supabase",
    supabaseArgs(plan, "start", "--ignore-health-check", "-x", E2E_EXCLUDED_SERVICES),
    { timeoutMs: 900_000 },
  );
  if (start.status !== 0) {
    throw new Error(
      `\`supabase start\` failed (exit ${start.status}) for the disposable workdir.\n${redactDiagnostic(start.stderr || start.stdout)}`,
    );
  }
  if (plan.migrationSource === REPO_MIGRATION_SOURCE) {
    const reset = run("supabase", supabaseArgs(plan, "db", "reset", "--yes"), { timeoutMs: 900_000 });
    if (reset.status !== 0) {
      throw new Error(
        `\`supabase db reset\` failed (exit ${reset.status}) while replaying repository migrations.\n${redactDiagnostic(reset.stderr || reset.stdout)}`,
      );
    }
  }
  const status = run("supabase", supabaseArgs(plan, "status", "-o", "json"));
  if (status.status !== 0) throw new Error("`supabase status -o json` failed for the disposable workdir.");
  const verdict = validateStackStatus(status.stdout, env);
  if (!verdict.ok) throw new HarnessBlockedError(verdict.reasons);
  return verdict.target;
}

export function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export function buildAppEnv(baseEnv, target) {
  const env = { ...baseEnv };
  for (const name of [...FORBIDDEN_ENV, ...LEGACY_ENV]) delete env[name];
  env.NEXT_PUBLIC_SUPABASE_URL = target.apiUrl;
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = target.publishableKey;
  env.NEXT_TELEMETRY_DISABLED = "1";
  return env;
}

export function startAppServer({ webRoot, plan, env, spawnImpl = spawn }) {
  const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");
  const host = new URL(plan.baseURL).hostname.replace(/^\[|\]$/g, "");
  return spawnImpl(process.execPath, [nextBin, "dev", "--hostname", host, "--port", String(plan.port)], {
    cwd: webRoot,
    env,
    stdio: "ignore",
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
  });
}

export async function stopAppServer(child, { platform = process.platform, spawnSyncImpl = spawnSync } = {}) {
  if (!child?.pid || child.exitCode !== null) return;
  if (platform === "win32") {
    spawnSyncImpl("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

export async function waitForApp(baseURL, { fetchImpl = fetch, timeoutMs = 180_000, intervalMs = 1_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`${baseURL}/api/status`, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`The app did not become ready at ${baseURL} within ${timeoutMs} ms.`);
}

/** Server-side confirmation that the started app is not wired to Development. */
export async function assertAppTargetsDisposableStack(baseURL, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${baseURL}/api/status`, { cache: "no-store" });
  const body = await response.json();
  const supabase = body?.supabase ?? {};
  if (supabase.urlConfigured !== true || supabase.publishableKeyConfigured !== true) {
    throw new HarnessBlockedError(["The started app is not configured with Supabase; it would fall back to mock data."]);
  }
  if (supabase.targetsDevelopmentProject !== false) {
    throw new HarnessBlockedError(["The started app reports that it targets the Development project."]);
  }
}

/** Read-only checks used by `npm run test:e2e` before Playwright starts. */
export async function runPreflight(env, { repoRoot, run, portCheck = isPortFree } = {}) {
  const verdict = checkStaticPreconditions(env, { repoRoot });
  if (!verdict.ok) return { status: "BLOCKED", reasons: verdict.reasons };
  const reasons = checkToolAvailability(run);
  if (!(await portCheck(verdict.plan.port))) {
    reasons.push(`Port ${verdict.plan.port} is already in use; the harness never reuses an existing server.`);
  }
  if (reasons.length) return { status: "BLOCKED", reasons };
  return { status: "READY", reasons: [], projectId: verdict.plan.projectId, baseURL: verdict.plan.baseURL };
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CleanupNotVerifiedError,
  E2E_COMPAT_MIGRATION_NAME,
  FORBIDDEN_ENV,
  HarnessBlockedError,
  LEGACY_ENV,
  MARKER_FILE,
  OPT_IN_MODE,
  assertAppTargetsDisposableStack,
  buildAppEnv,
  checkStaticPreconditions,
  createCommandRunner,
  createFixtureLedger,
  destroyStack,
  isLoopbackUrl,
  runPreflight,
  runWithGuaranteedCleanup,
  startFreshStack,
  validateStackStatus,
} from "./e2e/harness.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const PROJECT_ID = "zavqera-e2e-unit";
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const REPO_MIGRATIONS = readdirSync(path.join(repoRoot, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();

function anonJwt(role = "anon") {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode({ role })}.signature`;
}

function makeWorkdir({ projectId = PROJECT_ID, marker = projectId, config = true, linked = false, migrations = ["20261001000000_development_schema.sql"] } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "zavqera-e2e-unit-"));
  mkdirSync(path.join(dir, "supabase"), { recursive: true });
  if (config) writeFileSync(path.join(dir, "supabase", "config.toml"), `project_id = "${projectId}"\n\n[api]\nport = 54321\n`);
  if (marker !== null) writeFileSync(path.join(dir, MARKER_FILE), `${marker}\n`);
  mkdirSync(path.join(dir, "supabase", "migrations"), { recursive: true });
  for (const name of migrations) writeFileSync(path.join(dir, "supabase", "migrations", name), "-- schema\n");
  if (linked) {
    mkdirSync(path.join(dir, "supabase", ".temp"), { recursive: true });
    writeFileSync(path.join(dir, "supabase", ".temp", "project-ref"), "abcdefghijklmnopqrst");
  }
  return dir;
}

function readyEnv(workdir, extra = {}) {
  return { ZAVQERA_E2E_MODE: OPT_IN_MODE, ZAVQERA_E2E_SUPABASE_WORKDIR: workdir, ...extra };
}

const goodStatus = () => JSON.stringify({
  API_URL: "http://127.0.0.1:54321",
  PUBLISHABLE_KEY: "sb_publishable_local",
  SECRET_KEY: "sb_secret_local",
  SERVICE_ROLE_KEY: anonJwt("service_role"),
});

/** Scripted stand-in for the supabase/docker runner; records every call. */
function fakeRunner({ leftover = "", dockerFails = false, startFails = false, status = goodStatus() } = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args].join(" "));
    if (command === "docker") {
      if (dockerFails) return { status: 1, stdout: "" };
      return { status: 0, stdout: leftover };
    }
    if (args[0] === "start") return { status: startFails ? 1 : 0, stdout: "" };
    if (args[0] === "status") return { status: 0, stdout: status };
    return { status: 0, stdout: "" };
  };
  return { run, calls };
}

test("loopback allowlist accepts only plain local http origins", () => {
  for (const ok of ["http://127.0.0.1:3210", "http://localhost:54321", "http://[::1]:3000"]) assert.equal(isLoopbackUrl(ok), true, ok);
  for (const bad of [
    "https://127.0.0.1:3210",
    "http://mrwmmbytcymqgwvcoywd.supabase.co",
    "https://mrwmmbytcymqgwvcoywd.supabase.co",
    "http://127.0.0.1.evil.example:3210",
    "http://user:pass@127.0.0.1:3210",
    "http://10.0.0.5:3210",
    "not a url",
    "",
  ]) assert.equal(isLoopbackUrl(bad), false, bad);
});

test("static preconditions refuse each missing or unsafe precondition", (t) => {
  const workdir = makeWorkdir();
  t.after(() => rmSync(workdir, { recursive: true, force: true }));
  assert.equal(checkStaticPreconditions(readyEnv(workdir), { repoRoot }).ok, true);

  const cases = {
    "no opt-in": { ...readyEnv(workdir), ZAVQERA_E2E_MODE: "" },
    "wrong opt-in": { ...readyEnv(workdir), ZAVQERA_E2E_MODE: "yes" },
    "no workdir": { ZAVQERA_E2E_MODE: OPT_IN_MODE },
    "relative workdir": readyEnv("relative/dir"),
    "missing workdir": readyEnv(path.join(workdir, "does-not-exist")),
    "workdir inside repo": readyEnv(path.join(repoRoot, "apps")),
    "workdir contains repo": readyEnv(path.parse(repoRoot).root),
    "remote app url": readyEnv(workdir, { NEXT_PUBLIC_SUPABASE_URL: "https://mrwmmbytcymqgwvcoywd.supabase.co" }),
    "remote base url": readyEnv(workdir, { ZAVQERA_E2E_BASE_URL: "https://example.com" }),
    "base url with path": readyEnv(workdir, { ZAVQERA_E2E_BASE_URL: "http://127.0.0.1:3210/app" }),
  };
  for (const name of FORBIDDEN_ENV) cases[`forbidden ${name}`] = readyEnv(workdir, { [name]: "x" });
  for (const name of LEGACY_ENV) cases[`legacy ${name}`] = readyEnv(workdir, { [name]: "x" });
  for (const [name, env] of Object.entries(cases)) {
    const verdict = checkStaticPreconditions(env, { repoRoot });
    assert.equal(verdict.ok, false, name);
    assert.equal(verdict.plan, null, name);
    assert.ok(verdict.reasons.length > 0, name);
    assert.ok(!verdict.reasons.join(" ").includes("\"x\""), name);
  }
});

test("repo-migrations mode accepts exactly the repository migration set and resets the local DB", (t) => {
  const workdir = makeWorkdir({ migrations: [...REPO_MIGRATIONS, E2E_COMPAT_MIGRATION_NAME] });
  t.after(() => rmSync(workdir, { recursive: true, force: true }));
  const env = readyEnv(workdir, { ZAVQERA_E2E_MIGRATION_SOURCE: "repo-migrations" });
  const verdict = checkStaticPreconditions(env, { repoRoot });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.plan.migrationSource, "repo-migrations");

  const { run, calls } = fakeRunner();
  const target = startFreshStack(verdict.plan, run, {});
  assert.deepEqual(target, { apiUrl: "http://127.0.0.1:54321", publishableKey: "sb_publishable_local", serviceRoleKey: anonJwt("service_role") });
  assert.ok(calls.includes("supabase db reset --yes --workdir "+workdir));

  const wrong = makeWorkdir({ migrations: REPO_MIGRATIONS.slice(0, -1) });
  t.after(() => rmSync(wrong, { recursive: true, force: true }));
  const blocked = checkStaticPreconditions(
    readyEnv(wrong, { ZAVQERA_E2E_MIGRATION_SOURCE: "repo-migrations" }),
    { repoRoot },
  );
  assert.equal(blocked.ok, false);
});

test("static preconditions refuse workdirs that are not explicitly disposable", (t) => {
  const dirs = {
    "no config": makeWorkdir({ config: false }),
    "bad project id": makeWorkdir({ projectId: "nexo" }),
    "no marker": makeWorkdir({ marker: null }),
    "marker mismatch": makeWorkdir({ marker: "zavqera-e2e-other" }),
    linked: makeWorkdir({ linked: true }),
    "no schema dump": makeWorkdir({ migrations: [] }),
    "repository migrations": makeWorkdir({ migrations: ["20260921175955_w4_core_tables_and_indexes.sql"] }),
    "dump plus repository migrations": makeWorkdir({ migrations: ["20261001000000_development_schema.sql", "20261001081755_w20_cancelled_action_completion_semantics.sql"] }),
  };
  t.after(() => Object.values(dirs).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  for (const [name, dir] of Object.entries(dirs)) {
    assert.equal(checkStaticPreconditions(readyEnv(dir), { repoRoot }).ok, false, name);
  }
});

test("stack status validation keeps only loopback url and a non-privileged key", () => {
  const ok = validateStackStatus(`Some banner\n${goodStatus()}`);
  assert.deepEqual(ok.target, { apiUrl: "http://127.0.0.1:54321", publishableKey: "sb_publishable_local", serviceRoleKey: anonJwt("service_role") });
  assert.equal(validateStackStatus(JSON.stringify({ API_URL: "http://127.0.0.1:54321", ANON_KEY: anonJwt() })).ok, true);

  const bad = {
    remote: { API_URL: "https://mrwmmbytcymqgwvcoywd.supabase.co", PUBLISHABLE_KEY: "sb_publishable_x" },
    "secret key": { API_URL: "http://127.0.0.1:54321", PUBLISHABLE_KEY: "sb_secret_x" },
    "service role jwt": { API_URL: "http://127.0.0.1:54321", ANON_KEY: anonJwt("service_role") },
    "equals secret": { API_URL: "http://127.0.0.1:54321", PUBLISHABLE_KEY: "same", SECRET_KEY: "same" },
    "no key": { API_URL: "http://127.0.0.1:54321" },
  };
  for (const [name, status] of Object.entries(bad)) {
    const verdict = validateStackStatus(JSON.stringify(status));
    assert.equal(verdict.ok, false, name);
    assert.equal(verdict.target, null, name);
    assert.ok(!verdict.reasons.join(" ").includes("sb_secret_x"), name);
  }
  assert.equal(validateStackStatus("not json").ok, false);
  assert.equal(validateStackStatus(goodStatus(), { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9999" }).ok, false);
});

test("fixture ledger records bounded, de-duplicated exact UUIDs only", () => {
  const snapshots = [];
  const ledger = createFixtureLedger({ runId: "run-abc123", limit: 2, onChange: (json) => snapshots.push(json) });
  ledger.record("mission", UUID_A.toUpperCase());
  ledger.record("mission", UUID_A);
  assert.deepEqual(ledger.entries(), [{ kind: "mission", id: UUID_A }]);
  assert.throws(() => ledger.record("mission", "not-a-uuid"), /UUID/);
  assert.throws(() => ledger.record("profile", UUID_B), /Unknown fixture kind/);
  assert.throws(() => ledger.record("user", "a@example.test"), /UUID/);
  ledger.record("action", UUID_B);
  assert.throws(() => ledger.record("outcome", "33333333-3333-4333-8333-333333333333"), /limit/);
  assert.equal(snapshots.length, 2);
  assert.throws(() => createFixtureLedger({ runId: "BAD ID" }), /run id/);
});

test("cleanup always runs and its failure is never hidden", async () => {
  const order = [];
  assert.equal(await runWithGuaranteedCleanup(() => { order.push("body"); return 7; }, () => order.push("cleanup")), 7);
  assert.deepEqual(order, ["body", "cleanup"]);

  let cleaned = false;
  await assert.rejects(runWithGuaranteedCleanup(() => { throw new Error("body"); }, () => { cleaned = true; }), /body/);
  assert.equal(cleaned, true);

  await assert.rejects(runWithGuaranteedCleanup(() => "passed", () => { throw new CleanupNotVerifiedError("left over"); }), CleanupNotVerifiedError);

  await assert.rejects(
    runWithGuaranteedCleanup(() => { throw new Error("body"); }, () => { throw new Error("cleanup"); }),
    (error) => error instanceof AggregateError && error.errors.map((e) => e.message).join() === "body,cleanup",
  );
});

test("a fresh stack is destroyed and verified empty before it is started", () => {
  const plan = { workdir: "/tmp/zavqera-e2e", projectId: PROJECT_ID };
  const { run, calls } = fakeRunner();
  const target = startFreshStack(plan, run, {});
  assert.deepEqual(target, { apiUrl: "http://127.0.0.1:54321", publishableKey: "sb_publishable_local", serviceRoleKey: anonJwt("service_role") });
  assert.deepEqual(calls, [
    "supabase stop --no-backup --workdir /tmp/zavqera-e2e",
    `docker ps -aq --filter label=com.supabase.cli.project=${PROJECT_ID}`,
    `docker volume ls -q --filter label=com.supabase.cli.project=${PROJECT_ID}`,
    "supabase start --ignore-health-check -x studio,imgproxy,realtime,storage-api,postgres-meta,edge-runtime,logflare,vector,supavisor --workdir /tmp/zavqera-e2e",
    "supabase status -o json --workdir /tmp/zavqera-e2e",
  ]);
});

test("leftover data or an unverifiable teardown stops the run before start", () => {
  const plan = { workdir: "/tmp/zavqera-e2e", projectId: PROJECT_ID };
  for (const options of [{ leftover: "supabase_db_zavqera-e2e-unit\n" }, { dockerFails: true }]) {
    const { run, calls } = fakeRunner(options);
    assert.throws(() => startFreshStack(plan, run, {}), CleanupNotVerifiedError);
    assert.ok(!calls.some((call) => call.startsWith("supabase start")));
    assert.throws(() => destroyStack(plan, run), CleanupNotVerifiedError);
  }
  const unsafe = fakeRunner({ status: JSON.stringify({ API_URL: "https://x.supabase.co", PUBLISHABLE_KEY: "k" }) });
  assert.throws(() => startFreshStack(plan, unsafe.run, {}), HarnessBlockedError);
});

test("command runner only runs supabase/docker without a shell and strips privileged env", () => {
  const seen = [];
  const run = createCommandRunner({
    env: { PATH: "p", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_ACCESS_TOKEN: "t" },
    spawnSyncImpl: (command, args, options) => {
      seen.push({ command, args, options });
      return { status: 0, stdout: "secret output" };
    },
  });
  assert.throws(() => run("node", ["-e", "1"]), /Refusing/);
  assert.throws(() => run("sh", ["-c", "rm"]), /Refusing/);
  assert.equal(run("docker", ["ps"]).status, 0);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].options.shell, false);
  assert.deepEqual(Object.keys(seen[0].options.env), ["PATH"]);
  const missing = createCommandRunner({ spawnSyncImpl: () => ({ status: null, error: { code: "ENOENT" } }) })("supabase", ["--version"]);
  assert.deepEqual(missing, { status: -1, stdout: "", stderr: "", missing: true });
});

test("app env points only at the disposable stack", () => {
  const env = buildAppEnv({ PATH: "p", SUPABASE_SECRET_KEY: "s", ZAVQERA_E2E_USER_A_EMAIL: "a", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }, { apiUrl: "http://127.0.0.1:54321", publishableKey: "pk" });
  assert.deepEqual(env, { PATH: "p", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk", NEXT_TELEMETRY_DISABLED: "1" });
});

test("the started app must report a configured, non-Development backend", async () => {
  const reply = (supabase) => async () => ({ json: async () => ({ supabase }) });
  await assertAppTargetsDisposableStack("http://127.0.0.1:3210", { fetchImpl: reply({ urlConfigured: true, publishableKeyConfigured: true, targetsDevelopmentProject: false }) });
  for (const supabase of [
    { urlConfigured: false, publishableKeyConfigured: true, targetsDevelopmentProject: false },
    { urlConfigured: true, publishableKeyConfigured: true, targetsDevelopmentProject: true },
    { urlConfigured: true, publishableKeyConfigured: true },
  ]) {
    await assert.rejects(assertAppTargetsDisposableStack("http://127.0.0.1:3210", { fetchImpl: reply(supabase) }), HarnessBlockedError);
  }
});

test("preflight is blocked without preconditions and runs no command", async () => {
  const { run, calls } = fakeRunner();
  const result = await runPreflight({}, { repoRoot, run, portCheck: async () => true });
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(calls, []);
});

test("preflight reports missing tools and a busy port, and is read-only when ready", async (t) => {
  const workdir = makeWorkdir();
  t.after(() => rmSync(workdir, { recursive: true, force: true }));
  const missing = await runPreflight(readyEnv(workdir), { repoRoot, run: () => ({ status: -1, stdout: "", missing: true }), portCheck: async () => false });
  assert.equal(missing.status, "BLOCKED");
  assert.equal(missing.reasons.length, 3);

  const { run, calls } = fakeRunner();
  const ready = await runPreflight(readyEnv(workdir), { repoRoot, run, portCheck: async () => true });
  assert.equal(ready.status, "READY");
  assert.ok(calls.every((call) => /--version|docker version/.test(call)), calls.join("\n"));
});

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("ZAVQERA_E2E_") && !FORBIDDEN_ENV.includes(name)));

test("global setup refuses before running anything when not opted in", async () => {
  const { default: globalSetup } = await import("./e2e/global-setup.mjs");
  const saved = process.env.ZAVQERA_E2E_MODE;
  delete process.env.ZAVQERA_E2E_MODE;
  try {
    await assert.rejects(globalSetup(), HarnessBlockedError);
  } finally {
    if (saved !== undefined) process.env.ZAVQERA_E2E_MODE = saved;
  }
});

test("npm run test:e2e preflight exits 2 when blocked", () => {
  const result = spawnSync(process.execPath, [path.join(webRoot, "test", "e2e", "preflight.mjs")], { cwd: webRoot, env: cleanEnv(), encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /"status": "BLOCKED"/);
});

const playwrightCli = path.join(webRoot, "node_modules", "@playwright", "test", "cli.js");
test("Playwright discovers the full-loop spec without starting anything", { skip: !existsSync(playwrightCli) && "Playwright is not installed" }, () => {
  const result = spawnSync(process.execPath, [playwrightCli, "test", "--list"], { cwd: webRoot, env: cleanEnv(), encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /authenticated-browser\.spec\.mjs/);
  assert.match(result.stdout, /disposable full loop/);
  assert.match(result.stdout, /Total: 2 tests/);
});

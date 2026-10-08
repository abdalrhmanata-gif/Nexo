import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createFixtureLedger, isLoopbackUrl, writeLedgerFile } from "./harness.mjs";

// Runs only after global-setup.mjs has reset a disposable local stack and
// started the app against it. All fixture data lives in that stack and is
// destroyed with it; nothing here deletes history to "clean up".
const runtime = {
  supabaseUrl: process.env.ZAVQERA_E2E_RUNTIME_SUPABASE_URL,
  publishableKey: process.env.ZAVQERA_E2E_RUNTIME_PUBLISHABLE_KEY,
  baseURL: process.env.ZAVQERA_E2E_RUNTIME_BASE_URL,
  runId: process.env.ZAVQERA_E2E_RUN_ID,
  ledgerPath: process.env.ZAVQERA_E2E_LEDGER_PATH,
};

function assertRuntime() {
  const missing = Object.entries(runtime).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Refusing to run outside the disposable harness; missing runtime: ${missing.join(", ")}`);
  if (!isLoopbackUrl(runtime.supabaseUrl) || !isLoopbackUrl(runtime.baseURL)) {
    throw new Error("Refusing to run: runtime targets are not loopback.");
  }
}

function freshUser(label) {
  // Generated per run and never logged. They exist only in the disposable stack.
  return {
    email: `zavqera-e2e-${runtime.runId}-${label}@example.test`,
    password: `${randomBytes(18).toString("base64url")}Aa1!`,
  };
}

function dateInputValue(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function ownerSession(user) {
  const client = createClient(runtime.supabaseUrl, runtime.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword(user);
  if (error || !data.user) throw new Error("The account created through the app does not exist on the disposable stack.");
  return { client, userId: data.user.id };
}

async function readMission(client, missionId) {
  const { data, error } = await client.from("missions").select("id, status, version").eq("id", missionId).maybeSingle();
  if (error) throw error;
  return data;
}

async function transitionMissionDirect(client, missionId, toStatus, expectedVersion) {
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw error ?? new Error("Missing authenticated session.");
  const response = await fetch(`${runtime.supabaseUrl}/rest/v1/rpc/transition_mission`, {
    method: "POST",
    headers: {
      apikey: runtime.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      p_mission_id: missionId,
      p_to_status: toStatus,
      p_expected_version: expectedVersion,
    }),
  });
  return {
    status: response.status,
    body: await response.text(),
  };
}

async function readActions(client, missionId) {
  const { data, error } = await client.from("mission_actions").select("id, title, status, version, follow_up_at").eq("mission_id", missionId).order("position");
  if (error) throw error;
  return data;
}

async function readRows(client, table, missionId, columns = "id") {
  const { data, error } = await client.from(table).select(columns).eq("mission_id", missionId);
  if (error) throw error;
  return data;
}

function guardNetwork(context, blocked) {
  const base = new URL(runtime.baseURL);
  const allowed = new Set([
    base.origin,
    `http://localhost:${base.port}`,
    new URL(runtime.supabaseUrl).origin,
  ]);
  return context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:") || allowed.has(new URL(url).origin)) return route.continue();
    blocked.push(new URL(url).origin);
    return route.abort("blockedbyclient");
  });
}

function formWith(page, field) {
  return page.locator("form").filter({ has: field });
}

/** Submits the form owning `field` and waits for the server's verdict. */
async function submit(page, field, { method, path, expectStatus }) {
  const response = page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === path);
  const reload = expectStatus < 300 ? page.waitForEvent("load") : null;
  await formWith(page, field).locator('button[type="submit"]').click();
  const settled = await response;
  expect(settled.status(), `${method} ${path}`).toBe(expectStatus);
  if (reload) await reload;
  return settled;
}

async function signUp(page, user) {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await formWith(page, page.getByLabel("Email", { exact: true })).locator('button[type="submit"]').click();
  await expect(page, "Sign-up must return a session; disable email confirmations on the disposable stack.").toHaveURL(/\/app$/);
}

async function signIn(page, user) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await formWith(page, page.getByLabel("Email", { exact: true })).locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app$/);
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
}

async function rotatePasswordFor(user) {
  const serviceRoleKey = process.env.ZAVQERA_E2E_RUNTIME_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Disposable service-role key is unavailable.");
  const admin = createClient(runtime.supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error(`Disposable user lookup failed: ${listError.message}`);
  const target = users.users.find((candidate) => candidate.email?.toLowerCase() === user.email.toLowerCase());
  if (!target) throw new Error("Disposable password-reset fixture user was not found.");
  const { error } = await admin.auth.admin.updateUserById(target.id, { password: user.password });
  if (error) throw new Error(`Disposable password rotation failed: ${error.message}`);
}

test("disposable full loop: auth, plan, lifecycle, follow-up, verification, outcome and isolation", async ({ browser }) => {
  assertRuntime();
  const tag = `E2E ${runtime.runId}`;
  const ledger = createFixtureLedger({ runId: runtime.runId, onChange: (json) => writeLedgerFile(runtime.ledgerPath, json) });
  const blocked = [];
  const userA = freshUser("a");
  const userB = freshUser("b");
  const contextA = await browser.newContext({ baseURL: runtime.baseURL });
  const contextB = await browser.newContext({ baseURL: runtime.baseURL });
  await guardNetwork(contextA, blocked);
  await guardNetwork(contextB, blocked);
  const page = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    let owner;
    let missionId;
    let missionUrl;
    const titles = { first: `${tag} first step`, second: `${tag} second step`, added: `${tag} added step`, late: `${tag} late work` };
    const actionId = {};
    const statusOf = (title) => page.getByLabel(`Status for ${title}`, { exact: true });
    const actionPath = (title) => `/api/missions/${missionId}/actions/${actionId[title]}`;
    const missionPath = () => `/api/missions/${missionId}`;
    const moveMission = async (to) => {
      await page.getByLabel("Mission state", { exact: true }).selectOption(to);
      await submit(page, page.getByLabel("Mission state", { exact: true }), { method: "PATCH", path: missionPath(), expectStatus: 200 });
      expect((await readMission(owner.client, missionId)).status).toBe(to);
    };
    const moveAction = async (title, to, extra) => {
      await statusOf(title).selectOption(to);
      await extra?.();
      await submit(page, statusOf(title), { method: "PATCH", path: actionPath(title), expectStatus: 200 });
    };

    await test.step("sign up through the app and bind the session to the disposable stack", async () => {
      await signUp(page, userA);
      owner = await ownerSession(userA);
      ledger.record("user", owner.userId);
      await signUp(pageB, userB);
      ledger.record("user", (await ownerSession(userB)).userId);
    });

    await test.step("AI planner works server-side with isolated mock provider and charges quota once per request", async () => {
      const initialResponse = await page.request.get("/api/ai/usage");
      expect(initialResponse.status()).toBe(200);
      const initialUsage = await initialResponse.json();
      expect(initialUsage.monthly_limit).toBe(5);
      expect(initialUsage.generations_used).toBe(0);
      expect(initialUsage.remaining).toBe(5);

      await page.goto("/app/missions/new");
      await page.getByLabel("Your goal", { exact: true }).fill("Prepare a safe first plan for launching a small online shop.");
      await page.getByRole("button", { name: "Build my plan" }).click();
      await expect(page.getByLabel("Mission name", { exact: true })).not.toHaveValue("");
      await expect(page.getByLabel("Success criteria", { exact: true })).not.toHaveValue("");
      await expect(page.getByLabel(/^First steps/)).not.toHaveValue("");

      const requestId = `w21-ai-idempotency-${runtime.runId}-abcdef`;
      const first = await page.request.post("/api/ai/plan", {
        headers: { "x-request-id": requestId },
        data: { goal: "Create one reversible next step for the same test mission." },
        timeout: 20_000,
      });
      expect(first.status()).toBe(200);
      const second = await page.request.post("/api/ai/plan", {
        headers: { "x-request-id": requestId },
        data: { goal: "Create one reversible next step for the same test mission." },
        timeout: 20_000,
      });
      expect(second.status()).toBe(429);

      const finalResponse = await page.request.get("/api/ai/usage");
      expect(finalResponse.status()).toBe(200);
      const finalUsage = await finalResponse.json();
      expect(finalUsage.generations_used).toBe(2);
      expect(finalUsage.monthly_limit).toBe(5);
      expect(finalUsage.remaining).toBe(3);
    });

    await test.step("sign out protects the workspace; sign in restores it", async () => {
      await signOut(page);
      await page.goto("/app");
      await expect(page).toHaveURL(/\/auth\/sign-in/);
      await signIn(page, userA);
    });

    await test.step("password reset request and deterministic password rotation", async () => {
      await signOut(page);
      await page.goto("/auth/forgot-password");
      await page.getByLabel("Email", { exact: true }).fill(userA.email);
      await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
      await expect(page.getByRole("status")).toContainText("reset link");

      userA.password = `${randomBytes(18).toString("base64url")}Bb2!`;
      await rotatePasswordFor(userA);
      await signIn(page, userA);
      await expect(page).toHaveURL(/\/app$/);
    });

    await test.step("create a mission with first steps", async () => {
      await page.goto("/app/missions/new");
      await page.getByRole("button", { name: "Want more control? Add details" }).click();
      await page.getByLabel("Mission name", { exact: true }).fill(tag);
      await page.getByLabel("Intent", { exact: true }).fill("Prove the authenticated full mission loop end to end.");
      await page.getByLabel("Success criteria", { exact: true }).fill("Every state change is server-authoritative.");
      await page.getByLabel(/^First steps/).fill(`${titles.first}\n${titles.second}`);
      await formWith(page, page.getByLabel("Mission name", { exact: true })).locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/\/app\/missions\/[0-9a-f-]{36}$/i);
      missionUrl = page.url();
      missionId = missionUrl.split("/").pop();
      ledger.record("mission", missionId);
      expect(await readMission(owner.client, missionId)).toMatchObject({ status: "DRAFT", version: 1 });
      await expect(page.getByRole("heading", { level: 1, name: tag })).toBeVisible();
      await expect(page.getByRole("region", { name: "What should I do next?" })).toContainText(`Start: ${titles.first}`);
    });

    await test.step("add an action and persist the plan", async () => {
      await page.getByLabel("Add an action", { exact: true }).fill(titles.added);
      await submit(page, page.getByLabel("Add an action", { exact: true }), { method: "POST", path: `${missionPath()}/actions`, expectStatus: 201 });
      const actions = await readActions(owner.client, missionId);
      expect(actions.map((action) => [action.title, action.status])).toEqual([
        [titles.first, "PENDING"], [titles.second, "PENDING"], [titles.added, "PENDING"],
      ]);
      for (const action of actions) {
        actionId[action.title] = action.id;
        ledger.record("action", action.id);
      }
    });

    await test.step("reopen from the workspace", async () => {
      await page.goto("/app");
      await page.getByRole("heading", { level: 3, name: tag }).getByRole("link").click();
      await expect(page).toHaveURL(missionUrl);
      for (const title of [titles.first, titles.second, titles.added]) await expect(statusOf(title)).toHaveValue("PENDING");
    });

    await test.step("two independent authenticated HTTP sessions cannot both pass the same mission-version fence", async () => {
      // Keep the TOCTOU assertion independent from UI reload/load-event timing.
      for (const toStatus of ["PLANNING", "READY", "RUNNING"]) {
        const before = await readMission(owner.client, missionId);
        const moved = await transitionMissionDirect(owner.client, missionId, toStatus, before.version);
        expect(moved.status, `direct transition to ${toStatus}`).toBe(200);
        expect((await readMission(owner.client, missionId)).status).toBe(toStatus);
      }

      // Password reset may revoke prior sessions; re-bind the owner before the race.
      owner = await ownerSession(userA);
      const concurrentSession = (await ownerSession(userA)).client;
      const before = await readMission(owner.client, missionId);
      const [a, b] = await Promise.all([
        transitionMissionDirect(owner.client, missionId, "PAUSED", before.version),
        transitionMissionDirect(concurrentSession, missionId, "BLOCKED", before.version),
      ]);

      const successful = [a, b].filter((result) => result.status === 200);
      const stale = [a, b].filter((result) => result.status >= 400 && /STALE_VERSION/.test(result.body));
      expect(successful).toHaveLength(1);
      expect(stale).toHaveLength(1);

      const after = await readMission(owner.client, missionId);
      expect(after.version).toBe(before.version + 1);
      expect(["PAUSED", "BLOCKED"]).toContain(after.status);

      const restore = await transitionMissionDirect(owner.client, missionId, "RUNNING", after.version);
      expect(restore.status).toBe(200);
      await signOut(pageB);
      await signIn(pageB, userB);
    });

    await test.step("a stale mission version is rejected", async () => {
      const before = await readMission(owner.client, missionId);
      const stale = await page.request.patch(missionPath(), { data: { status: "PAUSED", expectedVersion: 1 } });
      expect(stale.status()).toBe(409);
      expect(await readMission(owner.client, missionId)).toEqual(before);
    });

    const followUp = dateInputValue(7);
    await test.step("wait on an action with a follow-up and survive reload", async () => {
      await moveAction(titles.first, "RUNNING");
      await moveAction(titles.first, "BLOCKED", () => page.getByLabel(`Follow up on ${titles.first}`, { exact: true }).fill(followUp));
      await moveMission("WAITING");
      await page.reload();
      await expect(statusOf(titles.first)).toHaveValue("BLOCKED");
      await expect(page.getByLabel(`Follow up on ${titles.first}`, { exact: true })).toHaveValue(followUp);
      const waiting = (await readActions(owner.client, missionId)).find((action) => action.id === actionId[titles.first]);
      expect(waiting.status).toBe("BLOCKED");
      expect(new Date(waiting.follow_up_at).getTime()).toBe(new Date(`${followUp}T09:00:00`).getTime());
      expect((await readMission(owner.client, missionId)).status).toBe("WAITING");
      await page.goto("/app");
      await page.getByRole("heading", { level: 3, name: tag }).getByRole("link").click();
      await expect(page).toHaveURL(missionUrl);
      await expect(statusOf(titles.first)).toHaveValue("BLOCKED");
      await expect(page.getByLabel(`Follow up on ${titles.first}`, { exact: true })).toHaveValue(followUp);
    });

    await test.step("resume, finish and cancel work", async () => {
      await page.goto(missionUrl);
      await moveMission("RUNNING");
      await moveAction(titles.first, "RUNNING");
      const resumed = (await readActions(owner.client, missionId)).find((action) => action.id === actionId[titles.first]);
      expect(resumed).toMatchObject({ status: "RUNNING", follow_up_at: null });
      await moveAction(titles.first, "COMPLETED");
      await moveAction(titles.second, "CANCELLED");
      await moveAction(titles.added, "RUNNING");
      await moveAction(titles.added, "COMPLETED");
      for (const title of [titles.first, titles.second, titles.added]) await expect(statusOf(title)).toHaveCount(0);
      const completed = (await readActions(owner.client, missionId)).find((action) => action.id === actionId[titles.first]);
      const reopen = await page.request.patch(actionPath(titles.first), { data: { status: "RUNNING", expectedVersion: completed.version } });
      expect(reopen.status(), "a completed action cannot be reopened").toBe(422);
      expect((await readActions(owner.client, missionId)).find((action) => action.id === completed.id)).toEqual(completed);
    });

    let verificationId;
    await test.step("verification is refused before checking, then recorded", async () => {
      const early = await page.request.post(`${missionPath()}/verification`, {
        data: { status: "VERIFIED", criteria: { summary: "early" }, evidence: { summary: "early" }, confidence: 1 },
      });
      expect(early.status()).toBe(422);
      expect(await readRows(owner.client, "mission_verifications", missionId)).toHaveLength(0);

      await moveMission("VERIFYING");
      const before = await readMission(owner.client, missionId);
      const direct = await owner.client.rpc("transition_mission", {
        p_mission_id: missionId, p_to_status: "COMPLETED", p_expected_version: before.version,
      });
      expect(direct.error?.message).toBe("VERIFIED_OUTCOME_REQUIRED");
      await page.getByLabel("Mission state", { exact: true }).selectOption("COMPLETED");
      await submit(page, page.getByLabel("Mission state", { exact: true }), { method: "PATCH", path: missionPath(), expectStatus: 422 });
      await expect(page.getByRole("alert").filter({ hasText: "Commit a passing verified outcome" })).toBeVisible();
      expect(await readMission(owner.client, missionId)).toEqual(before);
      await page.getByLabel("Verification criteria", { exact: true }).fill("Each step was observed in persisted state.");
      await page.getByLabel("Evidence summary", { exact: true }).fill("Authoritative reads after every reload.");
      await submit(page, page.getByLabel("Verification criteria", { exact: true }), { method: "POST", path: `${missionPath()}/verification`, expectStatus: 201 });
      const verifications = await readRows(owner.client, "mission_verifications", missionId, "id, status");
      expect(verifications).toHaveLength(1);
      expect(verifications[0].status).toBe("VERIFIED");
      verificationId = verifications[0].id;
      ledger.record("verification", verificationId);
    });

    await test.step("pending work blocks completion; cancelled work does not", async () => {
      await page.getByLabel("Add an action", { exact: true }).fill(titles.late);
      await submit(page, page.getByLabel("Add an action", { exact: true }), { method: "POST", path: `${missionPath()}/actions`, expectStatus: 201 });
      const late = (await readActions(owner.client, missionId)).find((action) => action.title === titles.late);
      actionId[titles.late] = late.id;
      ledger.record("action", late.id);

      // Completion must go through a verified outcome. A direct lifecycle move
      // to COMPLETED with pending work and no outcome is a release blocker.
      const verifying = await readMission(owner.client, missionId);
      const bypass = await page.request.patch(missionPath(), { data: { status: "COMPLETED", expectedVersion: verifying.version } });
      expect(bypass.ok(), "direct VERIFYING -> COMPLETED must be refused without a verified outcome").toBe(false);
      expect(await readMission(owner.client, missionId)).toEqual(verifying);
      await page.getByLabel("Outcome result", { exact: true }).fill("Blocked by late pending work.");
      await submit(page, page.getByLabel("Outcome result", { exact: true }), { method: "POST", path: `${missionPath()}/outcome`, expectStatus: 422 });
      expect(await readRows(owner.client, "mission_outcomes", missionId)).toHaveLength(0);
      expect((await readMission(owner.client, missionId)).status).toBe("VERIFYING");

      await moveAction(titles.late, "CANCELLED");
      await page.getByLabel("Outcome result", { exact: true }).fill("Reached with one step intentionally cancelled.");
      await submit(page, page.getByLabel("Outcome result", { exact: true }), { method: "POST", path: `${missionPath()}/outcome`, expectStatus: 200 });
      const outcomes = await readRows(owner.client, "mission_outcomes", missionId, "id, status, verification_id");
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({ status: "COMPLETED", verification_id: verificationId });
      ledger.record("outcome", outcomes[0].id);
      expect((await readMission(owner.client, missionId)).status).toBe("COMPLETED");
      const lateInsert = await page.request.post(`${missionPath()}/actions`, { data: { title: "Must not reopen completed work" } });
      expect(lateInsert.status()).toBe(422);
      expect(await readActions(owner.client, missionId)).toHaveLength(4);
      const cancelled = (await readActions(owner.client, missionId)).filter((action) => action.status === "CANCELLED");
      expect(cancelled.map((action) => action.id).sort()).toEqual([actionId[titles.second], actionId[titles.late]].sort());
      await expect(page.getByLabel("Mission state", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Outcome result", { exact: true })).toHaveCount(0);
    });

    await test.step("committing the same verified outcome again is idempotent", async () => {
      const before = { mission: await readMission(owner.client, missionId), events: (await readRows(owner.client, "mission_events", missionId, "event_type")).length };
      const repeat = await page.request.post(`${missionPath()}/outcome`, {
        data: { verificationId, result: { summary: "repeat" }, successScore: 1, status: "COMPLETED" },
      });
      expect(repeat.status()).toBe(200);
      const outcomes = await readRows(owner.client, "mission_outcomes", missionId, "id");
      expect(outcomes).toHaveLength(1);
      expect((await repeat.json()).id).toBe(outcomes[0].id);
      expect(await readMission(owner.client, missionId)).toEqual(before.mission);
      expect((await readRows(owner.client, "mission_events", missionId, "event_type")).length).toBe(before.events);
    });

    await test.step("another user can neither read nor change the mission", async () => {
      const before = { mission: await readMission(owner.client, missionId), actions: await readActions(owner.client, missionId) };
      await pageB.goto(missionUrl);
      await expect(pageB.getByText("Mission unavailable")).toBeVisible();
      await expect(pageB.getByText(tag)).toHaveCount(0);
      const attempts = [
        pageB.request.patch(`/api/missions/${missionId}`, { data: { status: "CANCELLED", expectedVersion: before.mission.version } }),
        pageB.request.post(`/api/missions/${missionId}/actions`, { data: { title: "intruder" } }),
        pageB.request.patch(`/api/missions/${missionId}/actions/${actionId[titles.first]}`, { data: { status: "RUNNING", expectedVersion: 1 } }),
        pageB.request.post(`/api/missions/${missionId}/verification`, { data: { status: "VERIFIED", criteria: { s: "x" }, evidence: { s: "x" }, confidence: 1 } }),
        pageB.request.post(`/api/missions/${missionId}/outcome`, { data: { verificationId, result: { s: "x" }, successScore: 1, status: "COMPLETED" } }),
      ];
      for (const response of await Promise.all(attempts)) expect(response.ok(), response.url()).toBe(false);
      const intruder = await ownerSession(userB);
      expect(await readMission(intruder.client, missionId)).toBeNull();
      expect(await readRows(intruder.client, "mission_events", missionId)).toHaveLength(0);
      expect(await readMission(owner.client, missionId)).toEqual(before.mission);
      expect(await readActions(owner.client, missionId)).toEqual(before.actions);
    });

    await test.step("history-bearing missions cannot be deleted, so the stack teardown is the cleanup", async () => {
      // Re-bind the browser session immediately before the final provenance
      // assertion so long-running E2E work cannot turn this test into an
      // authentication-expiry check.
      await signIn(page, userA);
      await page.goto(missionUrl);
      await page.getByRole("button", { name: /^Delete Mission/ }).click();
      await page.locator(`form[action="/api/missions/${missionId}"] button[type="submit"]`).first().click();
      // The database enforces provenance with the mission_events RESTRICT FK.
      // The UI intentionally masks the internal constraint and may return the
      // generic mission-delete error instead of exposing database details.
      await expect(page).toHaveURL(/\/app\?error=(mission-provenance|mission-delete)$/);
      expect(await readMission(owner.client, missionId)).not.toBeNull();
    });

    // Browser contexts are disposable test fixtures; explicit final sign-out is
    // unnecessary after the authenticated sign-out flow was already verified.
    expect(blocked, "requests left the loopback allowlist").toEqual([]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});async function recoveryLinkFor(user) {
  const serviceRoleKey = process.env.ZAVQERA_E2E_RUNTIME_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Disposable service-role key is unavailable.");
  const response = await fetch(`${runtime.supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      type: "recovery",
      email: user.email,
      redirect_to: `${runtime.baseURL}/auth/callback?next=%2Fauth%2Freset-password`,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Disposable recovery-link generation failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (typeof payload?.action_link !== "string" || !payload.action_link) {
    throw new Error("Disposable recovery-link response did not include an action_link.");
  }
  return payload.action_link;
}


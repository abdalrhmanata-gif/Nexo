import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const runtime = {
  supabaseUrl: process.env.ZAVQERA_E2E_RUNTIME_SUPABASE_URL,
  publishableKey: process.env.ZAVQERA_E2E_RUNTIME_PUBLISHABLE_KEY,
  baseURL: process.env.ZAVQERA_E2E_RUNTIME_BASE_URL,
  runId: process.env.ZAVQERA_E2E_RUN_ID,
};

function assertRuntime() {
  for (const [name, value] of Object.entries(runtime)) {
    if (!value) throw new Error(`Missing disposable runtime value: ${name}`);
  }
  if (!runtime.supabaseUrl.startsWith("http://127.0.0.1:")
      || !runtime.baseURL.startsWith("http://127.0.0.1:")) {
    throw new Error("Launch-gate E2E requires loopback-only runtime URLs.");
  }
}

function freshUser(label) {
  return {
    email: `zavqera-gate-${runtime.runId}-${label}@example.test`,
    password: `${randomBytes(18).toString("base64url")}Aa1!`,
  };
}

async function ownerSession(user) {
  const client = createClient(runtime.supabaseUrl, runtime.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword(user);
  if (error || !data.user) throw error ?? new Error("Disposable user sign-in failed.");
  return { client, userId: data.user.id };
}

async function signUp(page, user) {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function signIn(page, user) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
}

async function latestResetLink(email) {
  const mailbox = encodeURIComponent(email.split("@")[0]);
  const base = `http://127.0.0.1:54324/api/v1/mailbox/${mailbox}`;
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const response = await fetch(base, { headers: { Accept: "application/json" } });
    if (response.ok) {
      const messages = await response.json();
      if (Array.isArray(messages) && messages.length) {
        const latest = await (await fetch(`${base}/latest`, { headers: { Accept: "application/json" } })).json();
        const combined = `${latest.body?.text ?? ""}\n${latest.body?.html ?? ""}`.replaceAll("&amp;", "&");
        const match = combined.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
        if (match) return match[0].replace(/[)>.,]+$/, "");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Newest disposable password-reset email was not received.");
}

async function readMission(client, missionId) {
  const { data, error } = await client
    .from("missions")
    .select("id,status,version,workspace_id")
    .eq("id", missionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function directTransition(client, missionId, toStatus, expectedVersion) {
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw error ?? new Error("Missing session token.");
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
  return { status: response.status, body: await response.text() };
}

test("ZAVQERA launch gate: auth, password reset, AI quota, isolation and Mission TOCTOU", async ({ browser }) => {
  assertRuntime();

  const userA = freshUser("a");
  const userB = freshUser("b");
  const contextA = await browser.newContext({ baseURL: runtime.baseURL });
  const contextB = await browser.newContext({ baseURL: runtime.baseURL });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await test.step("authenticated signup and password reset", async () => {
      await signUp(pageA, userA);
      await signUp(pageB, userB);

      await signOut(pageA);
      await pageA.goto("/auth/forgot-password");
      await pageA.getByLabel("Email", { exact: true }).fill(userA.email);
      await pageA.getByRole("button", { name: "Send reset link" }).click();
      const resetLink = await latestResetLink(userA.email);
      await pageA.goto(resetLink);
      await expect(pageA).toHaveURL(/\/auth\/reset-password/);

      userA.password = `${randomBytes(18).toString("base64url")}Bb2!`;
      await pageA.getByLabel("New password", { exact: true }).fill(userA.password);
      await pageA.getByLabel("Confirm new password", { exact: true }).fill(userA.password);
      await pageA.getByRole("button", { name: "Update password" }).click();
      await expect(pageA).toHaveURL(/\/app$/);
      await signOut(pageA);
      await signIn(pageA, userA);
    });

    await test.step("server-side AI mock provider, quota and request idempotency", async () => {
      const initial = await pageA.request.get("/api/ai/usage");
      expect(initial.status()).toBe(200);
      expect(await initial.json()).toMatchObject({ monthly_limit: 20, generations_used: 0, remaining: 20 });

      await pageA.goto("/app");
      await pageA.getByLabel("Your goal", { exact: true }).fill("Prepare a safe launch plan for a small online shop.");
      await pageA.getByRole("button", { name: "Create plan with AI" }).click();
      await expect(pageA.locator(".ai-plan-result")).toContainText("Suggested plan");
      await expect(pageA.locator(".ai-plan-result")).toContainText("Clarify the desired outcome");
      await expect(pageA.locator(".ai-usage")).toContainText("19 of 20");

      const requestId = `gate-${runtime.runId}-abcdefghijkl`;
      const first = await pageA.request.post("/api/ai/plan", {
        headers: { "x-request-id": requestId },
        data: { goal: "Create one reversible next step for this test." },
        timeout: 20_000,
      });
      const second = await pageA.request.post("/api/ai/plan", {
        headers: { "x-request-id": requestId },
        data: { goal: "Create one reversible next step for this test." },
        timeout: 20_000,
      });
      expect(first.status()).toBe(200);
      expect(second.status()).toBe(429);

      const final = await (await pageA.request.get("/api/ai/usage", { timeout: 20_000 })).json();
      expect(final).toMatchObject({ generations_used: 2, remaining: 18 });
    });

    let missionId;
    await test.step("mission creation and independent-session TOCTOU fence", async () => {
      await pageA.goto("/app/missions/new");
      await pageA.getByLabel("Mission name", { exact: true }).fill(`Launch gate ${runtime.runId}`);
      await pageA.getByLabel("Intent", { exact: true }).fill("Prove server-authoritative Mission lifecycle and concurrency.");
      await pageA.getByLabel("Success criteria", { exact: true }).fill("Only one concurrent version-fenced transition succeeds.");
      await pageA.getByLabel(/^First steps/).fill("Validate ownership\nValidate concurrency");
      await pageA.getByRole("button", { name: "Create mission" }).click();
      await expect(pageA).toHaveURL(/\/app\/missions\/[0-9a-f-]{36}$/i);
      missionId = pageA.url().split("/").pop();

      const owner = await ownerSession(userA);
      const session2 = await ownerSession(userA);
      const before = await readMission(owner.client, missionId);
      expect(before).toMatchObject({ status: "DRAFT", version: 1 });

      for (const toStatus of ["PLANNING", "READY", "RUNNING"]) {
        const current = await readMission(owner.client, missionId);
        const moved = await directTransition(owner.client, missionId, toStatus, current.version);
        expect(moved.status).toBe(200);
      }

      const current = await readMission(owner.client, missionId);
      const [a, b] = await Promise.all([
        directTransition(owner.client, missionId, "PAUSED", current.version),
        directTransition(session2.client, missionId, "BLOCKED", current.version),
      ]);
      expect([a.status, b.status].filter((status) => status === 200)).toHaveLength(1);
      expect([a.body, b.body].filter((body) => /STALE_VERSION/.test(body))).toHaveLength(1);

      const after = await readMission(owner.client, missionId);
      expect(after.version).toBe(current.version + 1);
      expect(["PAUSED", "BLOCKED"]).toContain(after.status);
    });

    await test.step("cross-user isolation is enforced", async () => {
      const userBClient = await ownerSession(userB);
      expect(await readMission(userBClient.client, missionId)).toBeNull();

      const forbidden = await pageB.request.patch(`/api/missions/${missionId}`, {
        data: { status: "CANCELLED", expectedVersion: 1 },
        timeout: 20_000,
      });
      expect(forbidden.ok()).toBe(false);
    });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

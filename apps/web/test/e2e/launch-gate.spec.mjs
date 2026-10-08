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

async function recoveryLinkFor(user) {
  const serviceRoleKey = process.env.ZAVQERA_E2E_RUNTIME_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Disposable service-role key is unavailable.");
  const response = await fetch(`${runtime.supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ type: "recovery", email: user.email, redirect_to: `${runtime.baseURL}/auth/callback?next=%2Fauth%2Freset-password` }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Disposable recovery-link generation failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  const actionLink = typeof payload?.action_link === "string" ? payload.action_link : "";
  if (!actionLink) throw new Error("Disposable recovery-link response did not include an action_link.");
  const action = new URL(actionLink);
  const tokenHash = action.searchParams.get("token") ?? action.searchParams.get("token_hash");
  const type = action.searchParams.get("type") ?? "recovery";
  if (!tokenHash) throw new Error("Disposable recovery-link response did not include a token hash.");
  return `${runtime.baseURL}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&next=%2Fauth%2Freset-password`;
}

async function rotatePasswordFor(user, currentPassword, nextPassword) {
  const client = createClient(runtime.supabaseUrl, runtime.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (signInError || !signedIn.user) throw new Error(`Disposable password-rotation sign-in failed: ${signInError?.message ?? "missing user"}`);
  await client.auth.signOut();
  const serviceRoleKey = process.env.ZAVQERA_E2E_RUNTIME_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Disposable service-role key is unavailable.");
  const admin = createClient(runtime.supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.updateUserById(signedIn.user.id, { password: nextPassword });
  if (error) throw new Error(`Disposable password rotation failed: ${error.message}`);
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
    await test.step("authenticated signup and password recovery", async () => {
      await signUp(pageA, userA);
      await signUp(pageB, userB);

      await signOut(pageA);
      await pageA.goto("/auth/forgot-password");
      await pageA.getByLabel("Email", { exact: true }).fill(userA.email);
      await expect(pageA.getByRole("button", { name: "Send reset link" })).toBeVisible();
      const nextPassword = `${randomBytes(18).toString("base64url")}Bb2!`;
      await rotatePasswordFor(userA, userA.password, nextPassword);
      userA.password = nextPassword;
      await signIn(pageA, userA);
      await expect(pageA).toHaveURL(/\/app$/);
    });

    await test.step("server-side AI mock provider, quota and request idempotency", async () => {
      const initial = await pageA.request.get("/api/ai/usage");
      expect(initial.status()).toBe(200);
      expect(await initial.json()).toMatchObject({ monthly_limit: 5, generations_used: 0, remaining: 5 });

      await pageA.goto("/app/missions/new");
      const languageSelect = pageA.locator(".language-switcher select");
      await languageSelect.selectOption("ar");
      await expect(pageA.getByRole("heading", { name: "أخبر ZAVQERA بما تريد." })).toBeVisible();
      await expect(pageA.locator("#ai-goal")).toHaveAttribute("placeholder", "مثال: أريد إطلاق متجر إلكتروني صغير خلال ستة أسابيع");
      await languageSelect.selectOption("en");
      await expect(pageA.locator("#ai-goal")).toHaveAttribute("placeholder", "Example: launch a small online shop in six weeks");
      await expect(pageA.locator("form")).toHaveCount(1);
      await expect(pageA.locator("#ai-goal")).toHaveJSProperty("required", false);
      await pageA.getByLabel("Your goal", { exact: true }).fill("Prepare a safe launch plan for a small online shop.");
      await pageA.getByRole("button", { name: "Build my plan" }).click();
      await expect(pageA.getByLabel("Mission name", { exact: true })).not.toHaveValue("");
      await expect(pageA.getByLabel("Success criteria", { exact: true })).not.toHaveValue("");
      await expect(pageA.getByLabel(/^First steps/)).not.toHaveValue("");

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
      expect(final).toMatchObject({ monthly_limit: 5, generations_used: 2, remaining: 3 });
    });

    let missionId;
    await test.step("mission creation and independent-session TOCTOU fence", async () => {
      await pageA.goto("/app/missions/new");
      await pageA.getByRole("button", { name: "Want more control? Add details" }).click();
      await pageA.getByLabel("Mission name", { exact: true }).fill(`Launch gate ${runtime.runId}`);
      await pageA.getByLabel("Intent", { exact: true }).fill("Prove server-authoritative Mission lifecycle and concurrency.");
      await pageA.getByLabel("Success criteria", { exact: true }).fill("Only one concurrent version-fenced transition succeeds.");
      await pageA.getByLabel(/^First steps/).fill("Validate ownership\nValidate concurrency");
      await pageA.getByRole("button", { name: "Create mission" }).click();
      await expect(pageA).toHaveURL(/\/app\/missions\/[0-9a-f-]{36}$/i);
      missionId = pageA.url().split("/").pop();

      const owner = await ownerSession(userA);

      await test.step("read-only research execution persists and remains unverified", async () => {
        const responsePromise = pageA.waitForResponse(
          (response) => response.url().includes(`/api/missions/${missionId}/research`)
            && response.request().method() === "POST",
        );
        await pageA.getByRole("button", { name: "Run research", exact: true }).click();
        const response = await responsePromise;
        const payload = await response.json().catch(() => ({}));
        expect(response.ok(), `Research API failed (${response.status()}): ${JSON.stringify(payload)}`).toBe(true);
        expect(payload?.run?.status).toBe("COMPLETED");
        expect(payload?.run?.verified).toBe(false);
        await pageA.reload();
        await expect(pageA.getByText("Research result · Unverified", { exact: true })).toBeVisible();
        await expect(pageA.getByRole("link", { name: "ZAVQERA test source", exact: true })).toBeVisible();
        const saved = await owner.client
          .from("mission_events")
          .select("event_type,payload")
          .eq("mission_id", missionId)
          .eq("event_type", "RESEARCH_RUN_COMPLETED");
        expect(saved.error).toBeNull();
        expect(saved.data).toHaveLength(1);
        expect(saved.data[0]?.payload?.execution).toBe("read_only_research");
        expect(saved.data[0]?.payload?.verified).toBe(false);
        await pageA.reload();
        await expect(pageA.getByText("Research result · Unverified", { exact: true })).toBeVisible();
        await expect(pageA.getByRole("link", { name: "ZAVQERA test source", exact: true })).toBeVisible();
      });

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

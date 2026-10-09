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
  await page.getByTestId("sign-up-submit").click({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/app$/);
}

async function signIn(page, user) {
  await page.goto("/auth/sign-in", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const emailInput = page.getByLabel("Email", { exact: true });
  const passwordInput = page.getByLabel("Password", { exact: true });
  await emailInput.fill(user.email, { timeout: 10_000 });
  await passwordInput.fill(user.password, { timeout: 10_000 });

  await page.getByTestId("sign-in-submit").click({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
  await expect(page.getByTestId("sign-out")).toBeVisible({ timeout: 10_000 });
}

async function signOut(page) {
  const button = page.getByTestId("sign-out");
  const visible = await button.isVisible().catch(() => false);
  if (visible) {
    await button.click({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/auth\/sign-in(?:\?.*)?$/, { timeout: 15_000 });
    return;
  }

  // The authenticated shell control can be absent while the App Router is
  // transitioning. In that case expire this disposable browser session and
  // prove the protected route rejects the unauthenticated context.
  await page.context().clearCookies();
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/auth\/sign-in(?:\?.*)?$/, { timeout: 15_000 });
}

async function readMission(client, missionId) {
  const { data, error } = await client
    .from("missions")
    .select("id, status, version")
    .eq("id", missionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function directTransition(client, missionId, toStatus, expectedVersion) {
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) {
    throw error ?? new Error("Missing authenticated session.");
  }
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
  if (!response.ok) throw new Error(`Disposable recovery-link generation failed with HTTP ${response.status}.`);
  const actionLink = typeof payload?.action_link === "string" ? payload.action_link : "";
  const action = actionLink ? new URL(actionLink) : null;
  const tokenHash = typeof payload?.hashed_token === "string" && payload.hashed_token
    ? payload.hashed_token
    : typeof payload?.properties?.hashed_token === "string" && payload.properties.hashed_token
      ? payload.properties.hashed_token
      : action?.searchParams.get("token_hash") ?? action?.searchParams.get("token");
  const type = typeof payload?.verification_type === "string"
    ? payload.verification_type
    : action?.searchParams.get("type") ?? "recovery";
  if (!tokenHash || type !== "recovery") {
    throw new Error("Disposable recovery-link response did not include a valid recovery token.");
  }
  return `${runtime.baseURL}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=%2Fauth%2Freset-password`;
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
    await test.step("signup, anonymous access denial, and independent sign-in", async () => {
      await signUp(pageA, userA);
      await signUp(pageB, userB);
      const anonymousContext = await browser.newContext({ baseURL: runtime.baseURL });
      const anonymousPage = await anonymousContext.newPage();
      try {
        await anonymousPage.goto("/app");
        await expect(anonymousPage).toHaveURL(/\/auth\/sign-in(?:\?.*)?$/, { timeout: 15_000 });
        await signIn(anonymousPage, userA);
        await expect(anonymousPage).toHaveURL(/\/app$/, { timeout: 15_000 });
      } finally {
        await anonymousContext.close();
      }
    });

    await test.step("password recovery link rotates password and rejects the old credential", async () => {
      // Remove the signup session first so this step proves the recovery callback
      // creates a fresh session instead of accidentally reusing an existing one.
      await signOut(pageA);
      const nextPassword = `${randomBytes(24).toString("base64url")}Bb7!`;
      const recoveryUrl = await recoveryLinkFor(userA);

      // Do not wait for networkidle: Auth callback navigation may keep network
      // activity open. Navigation is bounded, then assertions wait for the UI.
      await pageA.goto(recoveryUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await expect.poll(() => new URL(pageA.url()).pathname, { timeout: 10_000 }).toBe("/auth/reset-password");

      const newPassword = pageA.getByLabel("New password", { exact: true });
      const confirmPassword = pageA.getByLabel("Confirm new password", { exact: true });
      await expect(newPassword).toBeVisible({ timeout: 10_000 });

      // Keep this end-to-end check focused on the recovery and password update
      // flow. The password breach range check is covered by its unit tests and
      // is an external dependency that can fail independently of Auth.
      await pageA.route("**/api/auth/password-policy", (route) => route.fulfill({ status: 204 }));

      await newPassword.fill(nextPassword);
      await confirmPassword.fill(nextPassword);
      const authUpdate = pageA.waitForResponse(
        (response) => new URL(response.url()).pathname.endsWith("/auth/v1/user")
          && response.request().method() !== "GET",
        { timeout: 15_000 },
      );
      await pageA.getByRole("button", { name: "Update password", exact: true }).click({ timeout: 10_000 });
      const authUpdateResponse = await authUpdate;
      expect(
        authUpdateResponse.status(),
        "Supabase Auth must accept the password update through the recovery session.",
      ).toBeLessThan(400);
      try {
        await expect.poll(() => new URL(pageA.url()).pathname, { timeout: 15_000 }).toBe("/app");
      } catch {
        const [alerts, statuses] = await Promise.all([
          pageA.getByRole("alert").allTextContents().catch(() => []),
          pageA.getByRole("status").allTextContents().catch(() => []),
        ]);
        throw new Error(
          `Password update returned HTTP ${authUpdateResponse.status()} but recovery stayed on /auth/reset-password; alert=${alerts.join(" | ") || "none"}; status=${statuses.join(" | ") || "none"}.`,
        );
      }
      await expect(pageA.getByTestId("sign-out")).toBeVisible({ timeout: 10_000 });

      const oldCredentialClient = createClient(runtime.supabaseUrl, runtime.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const oldCredential = await oldCredentialClient.auth.signInWithPassword({
        email: userA.email,
        password: userA.password,
      });
      expect(oldCredential.error, "the pre-recovery password must be rejected").toBeTruthy();
      expect(oldCredential.data.user).toBeNull();

      const newCredentialClient = createClient(runtime.supabaseUrl, runtime.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const newCredential = await newCredentialClient.auth.signInWithPassword({
        email: userA.email,
        password: nextPassword,
      });
      expect(newCredential.error, "the password entered through the recovery form must work").toBeNull();
      expect(newCredential.data.user?.id).toBeTruthy();
      await newCredentialClient.auth.signOut({ scope: "local" });

      // Later launch-gate checks intentionally sign in again using userA.
      userA.password = nextPassword;
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
      const createResponsePromise = pageA.waitForResponse(
        (response) => response.request().method() === "POST"
          && new URL(response.url()).pathname === "/app/missions/new",
        { timeout: 20_000 },
      );
      await pageA.getByRole("button", { name: "Create mission" }).click();
      const createResponse = await createResponsePromise;
      const createBody = await createResponse.text().catch(() => "");
      const safeCreateBody = createBody
        .replace(/eyJ[A-Za-z0-9_-]{20,}/g, "[redacted]")
        .replace(/Bearer\\s+[^\\s"'<>]+/gi, "Bearer [redacted]")
        .slice(0, 400);
      expect(
        createResponse.status(),
        `Mission creation server action failed: HTTP ${createResponse.status()} ${safeCreateBody}`,
      ).toBeLessThan(400);
      await expect(pageA).toHaveURL(/\/app\/missions\/[0-9a-f-]{36}$/i, { timeout: 20_000 });
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

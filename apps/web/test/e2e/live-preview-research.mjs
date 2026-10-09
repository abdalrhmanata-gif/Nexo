import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";

const previewUrl = process.env.PREVIEW_URL;
const runId = process.env.GITHUB_RUN_ID || Date.now().toString(36);

function requireValue(name, value) {
  if (!value) throw new Error(`Missing required live-preview test setting: ${name}`);
  return value;
}

function assertSafePreviewUrl(value) {
  const url = new URL(requireValue("PREVIEW_URL", value));
  if (url.protocol !== "https:" || url.hostname !== "deploy-preview-29--unique-kringle-3ce321.netlify.app") {
    throw new Error("Refusing live research test: PREVIEW_URL is not the expected HTTPS Deploy Preview.");
  }
  return url.origin;
}

async function waitForReactHandler(page, selector, handlerName) {
  await page.waitForFunction(
    ({ selector: target, handler }) => {
      const element = document.querySelector(target);
      if (!element) return false;
      return Object.keys(element).some((key) =>
        key.startsWith("__reactProps$") && typeof element[key]?.[handler] === "function"
      );
    },
    { selector, handler: handlerName },
    { timeout: 20_000 },
  );
}

async function installSensitiveAuthNavigationGuard(page) {
  const handler = async (route) => {
    const url = new URL(route.request().url());
    const sensitivePaths = new Set(["/auth/sign-in", "/auth/sign-up", "/auth/reset-password"]);
    if (sensitivePaths.has(url.pathname)
        && (url.searchParams.has("password") || url.searchParams.has("confirmPassword"))) {
      // Fail closed before an unhydrated form can put a test password in a URL.
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  };
  await page.route("**/*", handler);
  return async () => page.unroute("**/*", handler).catch(() => {});
}

async function waitForAppOrEmailConfirmation(page) {
  return page.waitForFunction(() => {
    if (window.location.pathname === "/app") return "authenticated";
    const status = document.querySelector('[role="status"]')?.textContent ?? "";
    if (status.includes("Check your email to confirm your account")) return "email-confirmation-required";
    return null;
  }, null, { timeout: 30_000 }).then((handle) => handle.jsonValue());
}

async function main() {
  const base = assertSafePreviewUrl(previewUrl);

  // Verify the destination before creating any account, workspace, mission, or audit evidence.
  const health = await fetch(`${base}/api/status`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!health.ok) throw new Error(`Preview status endpoint returned HTTP ${health.status}.`);
  const healthBody = await health.json();
  if (healthBody?.supabase?.urlConfigured !== true
      || healthBody?.supabase?.publishableKeyConfigured !== true
      || healthBody?.supabase?.targetsDevelopmentProject !== true) {
    throw new Error("Refusing live mission-research test: the preview does not prove it targets ZAVQERA Development.");
  }
  console.log(JSON.stringify({ event: "preflight", preview: base, supabaseDevelopment: true }));

  const email = `zavqera-live-research-${runId}-${randomBytes(5).toString("hex")}@example.test`;
  const password = `${randomBytes(28).toString("base64url")}Zz9!`;
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ baseURL: base });
    const page = await context.newPage();
    page.on("pageerror", () => {
      // Do not print message or page URL, since authentication links can contain temporary tokens.
      console.error("Browser reported a page-level JavaScript error during the live-preview test.");
    });

    const removeGuard = await installSensitiveAuthNavigationGuard(page);
    try {
      await page.goto("/auth/sign-up", { waitUntil: "domcontentloaded", timeout: 20_000 });
      await waitForReactHandler(page, "form.form-grid", "onSubmit");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);

      const signupResponsePromise = page.waitForResponse(
        (response) => response.request().method() === "POST"
          && new URL(response.url()).pathname.endsWith("/auth/v1/signup"),
        { timeout: 20_000 },
      );
      await page.getByTestId("sign-up-submit").click({ timeout: 10_000 });
      const signupResponse = await signupResponsePromise;
      if (!signupResponse.ok()) {
        const authError = await signupResponse.clone().json().catch(() => ({}));
        const code = typeof authError?.error_code === "string"
          ? authError.error_code
          : typeof authError?.code === "string"
            ? authError.code
            : typeof authError?.error === "string" ? authError.error : "";
        const message = typeof authError?.msg === "string"
          ? authError.msg
          : typeof authError?.message === "string"
            ? authError.message
            : typeof authError?.error_description === "string" ? authError.error_description : "";
        const safeDetail = `${code} ${message}`
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[redacted-email]")
          .replace(/eyJ[A-Za-z0-9_-]{20,}/g, "[redacted-token]")
          .replace(/Bearer\\s+[^\\s]+/gi, "Bearer [redacted]")
          .slice(0, 180)
          .trim();
        throw new Error(`Dedicated test account signup returned HTTP ${signupResponse.status()}${safeDetail ? `: ${safeDetail}` : ""}.`);
      }
      const accountState = await waitForAppOrEmailConfirmation(page);
      if (accountState !== "authenticated") {
        // Deliberately stop before mission creation if email confirmation prevents a session.
        throw new Error("Signup requires email confirmation; authenticated live research was not attempted.");
      }
      await page.getByTestId("sign-out").waitFor({ state: "visible", timeout: 10_000 });
      console.log(JSON.stringify({ event: "test-account-ready", authenticated: true, account: "dedicated-development-test-account" }));
    } finally {
      await removeGuard();
    }

    await page.goto("/app/missions/new", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("button", { name: "Want more control? Add details", exact: true }).click({ timeout: 10_000 });
    await page.getByLabel("Mission name", { exact: true }).fill(`Live research verification ${runId}`);
    await page.getByLabel("Intent", { exact: true }).fill("Research current, publicly available information about safely launching a small online business. Use live web sources and explain uncertainties.");
    await page.getByLabel("Success criteria", { exact: true }).fill("Return a concise evidence-based summary with real public web citations. Do not contact anyone or take external actions.");
    await page.getByLabel(/^First steps/).fill("Find current public guidance\nCompare credible sources\nSummarize risks and next steps");

    const createResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "POST"
        && new URL(response.url()).pathname === "/app/missions/new",
      { timeout: 25_000 },
    );
    await page.getByRole("button", { name: "Create mission", exact: true }).click({ timeout: 10_000 });
    const createResponse = await createResponsePromise;
    if (createResponse.status() >= 400) {
      throw new Error(`Dedicated mission creation returned HTTP ${createResponse.status()}.`);
    }
    await page.waitForURL(
      (url) => /^\/app\/missions\/[0-9a-f-]{36}$/i.test(url.pathname),
      { timeout: 25_000 },
    );
    const missionId = new URL(page.url()).pathname.split("/").pop();
    if (!missionId) throw new Error("Created mission URL did not contain a mission identifier.");

    const researchResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "POST"
        && new URL(response.url()).pathname === `/api/missions/${missionId}/research`,
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "Run research", exact: true }).click({ timeout: 10_000 });
    const researchResponse = await researchResponsePromise;
    const result = await researchResponse.json().catch(() => ({}));
    if (!researchResponse.ok()) {
      const safeError = typeof result?.error === "string" ? result.error : "no safe error detail";
      throw new Error(`Mission research endpoint returned HTTP ${researchResponse.status()}: ${safeError}`);
    }

    const summary = typeof result.summary === "string" ? result.summary.trim() : "";
    const sources = Array.isArray(result.sources)
      ? result.sources.filter((item) => item && typeof item.url === "string" && /^https?:\/\//i.test(item.url))
      : [];
    if (result.run?.status !== "COMPLETED"
        || result.run?.verified !== false
        || result.history_persisted !== true
        || summary.length < 80
        || sources.length < 1
        || sources.some((item) => /example\.com/i.test(item.url))) {
      throw new Error("Mission research response failed the live-provider, citation, or persistence assertions.");
    }
    await page.getByText("Research result · Unverified", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
    if (await page.locator(".research-sources a").count() < 1) {
      throw new Error("Mission research returned sources but the UI did not render them.");
    }

    await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByText("Research result · Unverified", { exact: true }).waitFor({ state: "visible", timeout: 25_000 });
    const persistedLinks = await page.locator(".research-sources a").count();
    if (persistedLinks < 1) throw new Error("Research source links did not survive a page reload.");

    // Never log mission intent, credentials, raw provider output, tokens, or complete URLs.
    console.log(JSON.stringify({
      event: "authenticated-live-mission-research",
      providerMode: "openai",
      missionCreated: true,
      researchStatus: result.run.status,
      verified: result.run.verified,
      historyPersisted: result.history_persisted,
      summaryCharacters: summary.length,
      returnedSourceCount: sources.length,
      persistedSourceLinkCount: persistedLinks,
      externalSideEffects: false,
      target: "ZAVQERA Development",
    }));
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  // Errors intentionally exclude stack traces and raw HTTP bodies to avoid token/credential leakage.
  console.error(`LIVE_RESEARCH_CHECK_FAILED: ${error instanceof Error ? error.message : "Unexpected failure"}`);
  process.exitCode = 1;
});

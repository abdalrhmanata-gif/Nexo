import { expect, test } from "@playwright/test";

const userA = {
  email: process.env.ZAVQERA_E2E_USER_A_EMAIL,
  password: process.env.ZAVQERA_E2E_USER_A_PASSWORD,
};
const userB = {
  email: process.env.ZAVQERA_E2E_USER_B_EMAIL,
  password: process.env.ZAVQERA_E2E_USER_B_PASSWORD,
};

async function signIn(page, user) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
}

test("authenticated browser session reads and mutates only its own mission", async ({ page }) => {
  const tag = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let missionUrl;

  try {
    await signIn(page, userA);
    await expect(page.getByText("Your private workspace")).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "New mission" }).click();
    await page.getByLabel("Mission name").fill(tag);
    await page.getByLabel("Intent").fill("Prove the authenticated Web boundary end to end.");
    await page.getByLabel("Success criteria").fill("Mission data is server-authoritative.");
    await page.getByRole("button", { name: "Create mission" }).click();

    await expect(page).toHaveURL(/\/app\/missions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    missionUrl = page.url();
    await expect(page.getByRole("heading", { name: tag })).toBeVisible();
    await expect(page.getByText("Authoritative mutation")).toBeVisible();
    await expect(page.getByLabel(/^Status for /)).toHaveValue("PENDING");

    let mutationResponse;
    let mutationHandled = false;
    const mutationUrlMatcher = (url) => url.pathname.includes("/api/missions/");
    async function capturePatchResponse(route) {
      if (mutationHandled || route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      mutationHandled = true;
      const response = await route.fetch();
      mutationResponse = response;
      await route.fulfill({ response });
    }
    await page.route(mutationUrlMatcher, capturePatchResponse);
    await page.getByLabel("Current state").selectOption("PLANNING");
    await page.getByRole("button", { name: "Transition mission" }).click();
    await expect.poll(() => Boolean(mutationResponse)).toBe(true);
    expect(mutationResponse.ok()).toBeTruthy();
    const mutationBody = await mutationResponse.json();
    expect(mutationBody.mission.lifecycleStatus).toBe("PLANNING");
    expect(mutationBody.mission.version).toBe(2);
    await page.unroute(mutationUrlMatcher, capturePatchResponse);
    await expect(page.getByLabel("Current state")).toHaveValue("PLANNING");
    await expect(page.getByText("MISSION STATUS TRANSITION")).toBeVisible();

    await signOut(page);
    await page.goto(missionUrl);
    await expect(page).toHaveURL(/\/auth\/sign-in/);

    await signIn(page, userB);
    await page.goto(missionUrl);
    await expect(page.getByText("Mission unavailable")).toBeVisible();
    await expect(page.getByText(tag)).toHaveCount(0);
    await signOut(page);
  } finally {
    if (missionUrl) {
      await signIn(page, userA);
      await page.goto(missionUrl);
      if (await page.getByRole("button", { name: "Delete Mission" }).count()) {
        page.once("dialog", (dialog) => dialog.accept());
        await page.getByRole("button", { name: "Delete Mission" }).click();
        // Missions that recorded a lifecycle event are protected from deletion
        // (mission_events ON DELETE RESTRICT). This test intentionally creates
        // such an event, so deletion here is expected to be rejected; accept
        // either outcome rather than requiring deletion to succeed.
        await expect(page).toHaveURL(/\/app$|\/auth\/sign-in\?error=mission-provenance/);
      }
      await signOut(page);
    }
  }
});

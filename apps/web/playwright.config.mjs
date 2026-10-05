import { defineConfig } from "@playwright/test";

const required = [
  "ZAVQERA_E2E_USER_A_EMAIL",
  "ZAVQERA_E2E_USER_A_PASSWORD",
  "ZAVQERA_E2E_USER_B_EMAIL",
  "ZAVQERA_E2E_USER_B_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Authenticated E2E requires Development environment variables: ${missing.join(", ")}`);
}

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL: process.env.ZAVQERA_E2E_BASE_URL ?? "http://127.0.0.1:3000",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: process.env.ZAVQERA_E2E_BASE_URL ?? "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

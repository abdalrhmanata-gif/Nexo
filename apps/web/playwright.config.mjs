import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";
import { DEFAULT_BASE_URL } from "./test/e2e/harness.mjs";

// Loading this config never starts anything. The global setup refuses to run
// unless every precondition in test/e2e/harness.mjs holds, and it starts the
// app itself (never reusing an existing server) only after the disposable
// stack has been reset and verified.
export default defineConfig({
  testDir: "./test/e2e",
  outputDir: path.join(os.tmpdir(), "zavqera-e2e", "playwright-results"),
  globalSetup: "./test/e2e/global-setup.mjs",
  timeout: 360_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["line"]],
  use: {
    baseURL: process.env.ZAVQERA_E2E_BASE_URL || DEFAULT_BASE_URL,
    headless: true,
    trace: "retain-on-failure",
  },
});

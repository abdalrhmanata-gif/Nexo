import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const netlifyWorkflow = readFileSync(
  join(repoRoot, ".github", "workflows", "web-deploy-netlify.yml"),
  "utf8",
);
const webWorkflow = readFileSync(
  join(repoRoot, ".github", "workflows", "web.yml"),
  "utf8",
);
const robotsRoute = readFileSync(
  join(repoRoot, "apps", "web", "app", "robots.ts"),
  "utf8",
);

test("Netlify branch workflow deploys and verifies a draft preview only", () => {
  assert.match(netlifyWorkflow, /deploy --build --context deploy-preview --json/);
  assert.doesNotMatch(netlifyWorkflow, /--prod(?:\s|$)|--prod-if-unlocked/);
  assert.match(netlifyWorkflow, /id: deploy/);
  assert.match(netlifyWorkflow, /PREVIEW_URL:\s*\$\{\{\s*steps\.deploy\.outputs\.preview_url\s*\}\}/);
  assert.doesNotMatch(netlifyWorkflow, /api getSite/);
});

test("robots route defines public crawl access and excludes app, API and auth paths", () => {
  assert.match(robotsRoute, /userAgent:\s*"\*"/);
  assert.match(robotsRoute, /allow:\s*"\/"/);
  assert.match(robotsRoute, /disallow:\s*\[\s*"\/app",\s*"\/api\/",\s*"\/auth\/"\s*\]/);
});

test("web CI smoke-tests the built robots route over HTTP", () => {
  assert.match(webWorkflow, /name: Smoke-test generated robots route/);
  assert.match(webWorkflow, /npx next start --hostname 127\.0\.0\.1/);
  assert.match(webWorkflow, /http:\/\/127\.0\.0\.1:3100\/robots\.txt/);
  assert.match(webWorkflow, /HTTP 200/);
  for (const path of ["/app", "/api/", "/auth/"]) {
    assert.ok(webWorkflow.includes(path), "web CI must assert robots policy for " + path);
  }
});

test("Netlify checks robots.txt at the exact URL returned by its CLI deployment", () => {
  assert.match(netlifyWorkflow, /name: Verify robots\\.txt on the actual Netlify CLI preview/);
  assert.match(netlifyWorkflow, /PREVIEW_URL:\\s*\\$\\{\\{\\s*steps\\.deploy\\.outputs\\.preview_url\\s*\\}\\}/);
  assert.match(netlifyWorkflow, /Netlify CLI preview \/robots\\.txt returned HTTP 200/);
  assert.doesNotMatch(webWorkflow, /deploy-preview-\\$\\{\\{\\s*github\\.event\\.pull_request\\.number/);
});

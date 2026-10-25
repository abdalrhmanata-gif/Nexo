import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const workflow = readFileSync(
  join(repoRoot, ".github", "workflows", "web-deploy-netlify.yml"),
  "utf8",
);

test("Netlify branch workflow deploys and verifies a draft preview only", () => {
  assert.match(workflow, /deploy --build --context deploy-preview --json/);
  assert.doesNotMatch(workflow, /--prod(?:\s|$)|--prod-if-unlocked/);
  assert.match(workflow, /id: deploy/);
  assert.match(workflow, /PREVIEW_URL:\s*\$\{\{\s*steps\.deploy\.outputs\.preview_url\s*\}\}/);
  assert.doesNotMatch(workflow, /api getSite/);
});

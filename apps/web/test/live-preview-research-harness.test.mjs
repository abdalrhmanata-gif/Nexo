import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(join(root, "test/e2e/live-preview-research.mjs"), "utf8");
const workflow = readFileSync(join(root, "../../.github/workflows/web-deploy-netlify.yml"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");

test("live research prefers paired pre-provisioned Dev credentials and keeps values out of logs", () => {
  assert.match(script, /SUPABASE_DEV_TEST_EMAIL/);
  assert.match(script, /SUPABASE_DEV_TEST_PASSWORD/);
  assert.match(script, /if \(hasTestAccountEmail !== hasTestAccountPassword\)/);
  assert.match(script, /pre-provisioned-development-test-account/);
  assert.match(script, /Never log mission intent, credentials, raw provider output, tokens, or complete URLs/);
  assert.doesNotMatch(script, /console\.log\([^\n]*(testAccountEmail|testAccountPassword|adminApiKey|password)\s*[,)]/);
});

test("the live gate refuses any target other than the fixed HTTPS preview and Development project", () => {
  assert.match(script, /deploy-preview-29--unique-kringle-3ce321\.netlify\.app/);
  assert.match(script, /mrwmmbytcymqgwvcoywd\.supabase\.co/);
  assert.match(script, /targetsDevelopmentProject !== true/);
});

test("pre-provisioned accounts are not deleted; only test-generated users without a Mission are cleaned", () => {
  assert.match(script, /if \(!usePreProvisionedAccount\)/);
  assert.match(script, /if \(authUserId && !missionCreated\)/);
  assert.match(script, /Once a mission exists, retain its immutable research\/audit provenance/);
});

test("workflow gate is explicitly marked, same-repository only, and passes test credentials as protected secrets", () => {
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository && contains\(github\.event\.pull_request\.body, '\[live-openai-research\]'\)/);
  assert.match(workflow, /secrets\.SUPABASE_DEV_TEST_EMAIL/);
  assert.match(workflow, /secrets\.SUPABASE_DEV_TEST_PASSWORD/);
  assert.match(workflow, /secrets\.SUPABASE_DEV_SERVICE_ROLE_KEY/);
  assert.match(readme, /SUPABASE_DEV_TEST_EMAIL/);
  assert.match(readme, /Do not run this marked workflow repeatedly/);
});

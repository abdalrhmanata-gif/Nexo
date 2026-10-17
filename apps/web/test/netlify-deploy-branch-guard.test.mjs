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

test("manual Netlify production deploy is restricted to explicit release branches", () => {
  const deployStart = workflow.indexOf("\n  deploy:\n");
  const previewStart = workflow.indexOf("\n  verify-preview:", deployStart + 1);
  assert.notEqual(deployStart, -1, "production deploy job must exist");
  assert.notEqual(previewStart, -1, "preview verifier job must remain separate");
  const deployJob = workflow.slice(deployStart, previewStart);
  const condition = deployJob.match(/^    if:\s*>-\s*\n([\s\S]*?)(?=^    runs-on:)/m)?.[1] ?? "";

  assert.match(condition, /github\.event_name\s*!=\s*'pull_request'/);
  assert.match(condition, /github\.ref\s*==\s*'refs\/heads\/zavqera\/integrate-origin-main-clean'/);
  assert.match(condition, /github\.ref\s*==\s*'refs\/heads\/zavqera\/alternative-web-deployment'/);
  assert.equal((condition.match(/github\.ref\s*==/g) ?? []).length, 2,
    "only the two explicitly approved release branches may run the production deploy job");
  assert.match(deployJob, /netlify-cli@latest deploy --build --prod/);
  assert.doesNotMatch(deployJob, /if:\s*github\.event_name\s*!=\s*'pull_request'/,
    "manual dispatch must not bypass the release-branch allowlist");
});

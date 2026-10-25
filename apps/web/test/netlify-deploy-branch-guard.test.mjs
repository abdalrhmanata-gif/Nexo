import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const workflow = readFileSync(
  join(repoRoot, ".github", "workflows", "web-deploy-netlify.yml"),
  "utf8",
).replace(/\r\n/g, "\n");

test("Netlify workflow permits draft previews but never production deploys", () => {
  const deployStart = workflow.indexOf("\n  deploy:\n");
  const previewStart = workflow.indexOf("\n  verify-preview:", deployStart + 1);
  assert.notEqual(deployStart, -1, "deployment job must exist");
  assert.notEqual(previewStart, -1, "PR preview verification must remain separate");
  const deployJob = workflow.slice(deployStart, previewStart);
  const condition = deployJob.match(/^    if:\s*>-\s*\n([\s\S]*?)(?=^    runs-on:)/m)?.[1] ?? "";

  assert.match(condition, /github\.event_name\s*!=\s*'pull_request'/);
  assert.match(condition, /github\.ref\s*==\s*'refs\/heads\/zavqera\/integrate-origin-main-clean'/);
  assert.match(condition, /github\.ref\s*==\s*'refs\/heads\/zavqera\/alternative-web-deployment'/);
  assert.equal((condition.match(/github\.ref\s*==/g) ?? []).length, 2,
    "only the two explicitly approved branches may create a draft deploy");

  assert.match(deployJob, /deploy --build --context deploy-preview/);
  assert.doesNotMatch(workflow, /\bdeploy\b[^\n]*--prod|deploy[^\n]*--prod/i,
    "no workflow path may invoke a production deploy");
  assert.match(deployJob, /PREVIEW_URL/,
    "route checks must target the URL returned for this draft preview");
});

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
  assert.match(workflow, /pull_request:\s*\n\s+types: \[opened, synchronize, reopened\]/,
    "PR updates must continue to trigger preview verification");
  assert.match(workflow, /branches:\s*\n\s+- "zavqera\/alternative-web-deployment"/,
    "PR preview checks must target the intended deployment branch");
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

  const previewJob = workflow.slice(previewStart);
  assert.match(previewJob, /if: github\.event_name == 'pull_request'/,
    "PR events must run verification without running the deploy job");
});

test("real OpenAI planning is skipped unless a same-repository PR explicitly opts in", () => {
  const stepStart = workflow.indexOf("      - name: Verify real OpenAI mission planning");
  const nextStep = workflow.indexOf("      - name: Check Development-only live research authentication config", stepStart + 1);
  assert.notEqual(stepStart, -1, "live OpenAI planning step must remain identifiable");
  assert.notEqual(nextStep, -1, "live research config step must follow it");
  const step = workflow.slice(stepStart, nextStep);
  const condition = step.match(/^        if:\s*>-\s*\n([\s\S]*?)(?=^        run:)/m)?.[1] ?? "";

  assert.match(condition, /github\.event_name\s*==\s*'pull_request'/,
    "push and manual workflow runs must never call the real provider");
  assert.match(condition, /github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/,
    "fork PRs must not receive provider credentials or invoke the live check");
  assert.match(condition, /contains\(github\.event\.pull_request\.body,\s*'\[live-openai-planning\]'\)/,
    "same-repository PR must explicitly opt in");
  assert.doesNotMatch(condition, /\|\|/,
    "no alternate event path may bypass the explicit PR opt-in");
});

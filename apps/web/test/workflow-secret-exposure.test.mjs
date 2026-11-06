import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

// A pull_request job runs code the PR author wrote. Give that job a privileged
// secret and the author can change the code to print it. Nothing here suggests
// that has happened — this test exists so that it cannot start happening
// quietly in a workflow edit nobody reads closely.
//
// PR #29 proposes exactly that shape: a step gated on a marker in the PR body
// that runs checked-out PR code with SUPABASE_DEV_SERVICE_ROLE_KEY and test
// account credentials. main does not have it. This test is what keeps main
// from acquiring it.

const workflowsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../.github/workflows");
const workflows = readdirSync(workflowsDir)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => ({ name, body: readFileSync(join(workflowsDir, name), "utf8") }));

/** Secrets that grant real authority, as opposed to a deploy token scoped elsewhere. */
const PRIVILEGED = /secrets\.[A-Z0-9_]*(SERVICE_ROLE|TEST_PASSWORD|TEST_EMAIL|OPENAI|ANTHROPIC|RESEND|SMTP|PRIVATE_KEY|ADMIN)[A-Z0-9_]*/g;

/** The part of a workflow before the first job, which is where triggers live. */
function triggerBlock(body) {
  const jobsAt = body.search(/^jobs:/m);
  return jobsAt === -1 ? body : body.slice(0, jobsAt);
}

const pullRequestTriggered = workflows.filter(({ body }) => /^\s{0,2}pull_request(_target)?:/m.test(triggerBlock(body)));

test("at least one workflow exists to check", () => {
  assert.ok(workflows.length > 0, "no workflow files were found — this test would pass vacuously");
});

test("no pull_request workflow hands a privileged secret to the job", () => {
  for (const { name, body } of pullRequestTriggered) {
    const found = [...new Set(body.match(PRIVILEGED) ?? [])];
    assert.deepEqual(found, [],
      `${name} is pull_request-triggered and references ${found.join(", ")}. `
      + "A pull request runs the author's code; a privileged secret in that job is readable by them. "
      + "Move the step to a trusted ref with an approval gate, and run the test code from that ref.");
  }
});

test("pull_request_target is not used at all", () => {
  // pull_request_target runs with the base repository's secrets while the PR
  // branch is checked out on request. It is the sharpest version of this
  // problem and the repository has no need for it.
  for (const { name, body } of workflows) {
    assert.doesNotMatch(triggerBlock(body), /^\s{0,2}pull_request_target:/m,
      `${name} uses pull_request_target`);
  }
});

test("no job is gated on a marker in the pull request body", () => {
  // A marker in the PR body is author-controlled text deciding whether a step
  // runs. It is not an approval, however much it reads like one.
  for (const { name, body } of workflows) {
    assert.doesNotMatch(body, /contains\(\s*github\.event\.pull_request\.body/,
      `${name} decides whether a step runs from text the pull request author wrote. `
      + "Use an environment with required reviewers instead.");
  }
});

test("the deploy workflow does not deploy from a pull request", () => {
  const deploy = workflows.find(({ name }) => name === "web-deploy-netlify.yml");
  assert.ok(deploy, "web-deploy-netlify.yml is missing");
  assert.doesNotMatch(triggerBlock(deploy.body), /^\s{0,2}pull_request(_target)?:/m,
    "the workflow holding the Netlify token must not run on pull_request");
});

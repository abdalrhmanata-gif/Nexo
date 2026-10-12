import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(join(root, "test/e2e/live-preview-research.mjs"), "utf8");
const workflow = readFileSync(join(root, "../../.github/workflows/web-deploy-netlify.yml"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");
const researchRoute = readFileSync(join(root, "app/api/missions/[id]/research/route.ts"), "utf8");
const executionGuardMigration = readFileSync(join(root, "../../supabase/migrations/20261010125620_w56_agent_execution_duplicate_dispatch_guard.sql"), "utf8");
const researchCompletionMigration = readFileSync(join(root, "../../supabase/migrations/20261012180000_w79_trusted_research_completion.sql"), "utf8");
const trustedWorkerRoute = readFileSync(join(root, "app/api/internal/agent-executions/[executionId]/route.ts"), "utf8");
const trustedWorkerOrigin = readFileSync(join(root, "lib/mission-authority/trusted-worker-origin.mjs"), "utf8");
const envExample = readFileSync(join(root, ".env.example"), "utf8");

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

test("hosted Research is fail-closed until trusted completion schema parity is explicitly enabled", () => {
  const providerMode = researchRoute.indexOf("const providerMode =");
  const trustedSchemaGate = researchRoute.indexOf(
    'process.env.ZAVQERA_TRUSTED_RESEARCH_COMPLETION_ENABLED !== "true"',
  );
  const apiKeyCheck = researchRoute.indexOf('if (providerMode !== "mock" && !apiKey)');
  const quotaAndProviderFlow = researchRoute.indexOf("const result = await runAiGeneration({");

  assert.ok(providerMode >= 0, "provider mode must be resolved explicitly");
  assert.ok(trustedSchemaGate > providerMode, "schema gate must follow provider-mode resolution");
  assert.ok(trustedSchemaGate < apiKeyCheck, "schema gate must run before API-key handling");
  assert.ok(trustedSchemaGate < quotaAndProviderFlow, "schema gate must run before quota reservation/provider execution");
  assert.match(researchRoute, /Mission Research is temporarily unavailable on this environment/);
  assert.match(envExample, /^ZAVQERA_TRUSTED_RESEARCH_COMPLETION_ENABLED=false$/m);
  assert.match(readme, /Keep this flag false until hosted Development has an authorized migration plan/);
});

test("Mission research refuses agents whose authoritative settings are not explicitly read-only", () => {
  assert.match(researchRoute, /agent\.authority\?\.mode === "read_only"/);
  assert.match(researchRoute, /agent\.authority\?\.external_side_effects === false/);
  assert.match(researchRoute, /agent\.status === "ACTIVE"/);
  assert.match(researchRoute, /agent\.name === "ZAVQERA Research Agent"/);
});

test("Mission research opens the server-side agent/approval gate before calling the external AI provider", () => {
  const prepare = researchRoute.indexOf("prepare: async () =>");
  const startExecution = researchRoute.indexOf('supabase.rpc("start_agent_execution"');
  const generate = researchRoute.indexOf("generate: () =>");
  const providerRequest = researchRoute.indexOf("requestMissionResearch(");
  assert.ok(prepare >= 0, "quota service must expose a pre-dispatch preparation hook");
  assert.ok(startExecution > prepare, "agent execution gate must run inside preparation");
  assert.ok(generate > startExecution, "provider generation must follow authorization");
  assert.ok(providerRequest > generate, "OpenAI research request must happen after the execution gate");
  assert.match(researchRoute, /throw new Error\("AGENT_APPROVAL_REQUIRED"\)/);
  assert.match(researchRoute, /status: executionStatus/);
  assert.match(researchRoute, /result\.disposition === "hold" \? "UNKNOWN" : "FAILED"/);
});


test("read-only research completion uses the token-protected internal worker route", () => {
  assert.doesNotMatch(researchRoute, /createSupabaseAdminClient/);
  assert.match(researchRoute, /completeReadOnlyResearchExecution\(request,/);
  assert.doesNotMatch(researchRoute, /supabase\.rpc\("complete_read_only_research_execution"/);
  assert.doesNotMatch(researchRoute, /supabase\.rpc\("complete_agent_execution"/);
  assert.match(researchRoute, /ZAVQERA_EXECUTION_WORKER_TOKEN/);
  assert.match(researchRoute, /operation: "complete_read_only_research"/);
  assert.match(trustedWorkerRoute, /isTrustedExecutionWorkerRequest/);
  assert.match(trustedWorkerRoute, /workerBody\.operation === "complete_read_only_research"/);
  assert.match(trustedWorkerRoute, /p_requested_by: workerBody\.requestedBy/);
  assert.match(trustedWorkerRoute, /p_execution_id: executionId/);
  assert.match(trustedWorkerRoute, /createSupabaseAdminClient/);
  assert.match(trustedWorkerOrigin, /deployPrimeUrl/);
  assert.match(trustedWorkerOrigin, /localhost/);
  assert.match(researchCompletionMigration, /auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(researchCompletionMigration, /v_initial\.requested_by <> p_requested_by/);
  assert.match(researchCompletionMigration, /private\.can_edit_workspace\(v_initial\.workspace_id, p_requested_by\)/);
  assert.match(researchCompletionMigration, /external_side_effects/);
  assert.match(researchCompletionMigration, /RESEARCH_RESULT_MUST_REMAIN_UNVERIFIED/);
});

test("duplicate execution keys cannot authorize a second external research dispatch", () => {
  assert.match(executionGuardMigration, /raise exception 'EXECUTION_ALREADY_EXISTS'/);
  assert.match(researchRoute, /execution\.error\.message === "EXECUTION_ALREADY_EXISTS"/);
  assert.match(researchRoute, /AGENT_EXECUTION_ALREADY_EXISTS/);
  assert.match(researchRoute, /status: 409/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(path.join(root, "app/api/ai/plan/route.ts"), "utf8");
const service = readFileSync(path.join(root, "lib/ai-generation-service.mjs"), "utf8");
const usage = readFileSync(path.join(root, "lib/ai-usage.ts"), "utf8");
const planner = readFileSync(path.join(root, "lib/ai-planner.ts"), "utf8");
const component = readFileSync(path.join(root, "components/ai-planner.tsx"), "utf8");
const workspace = readFileSync(path.join(root, "app/app/page.tsx"), "utf8");

test("AI route authenticates before invoking the provider service and keeps the key server-side", () => {
  assert.ok(route.indexOf("getAuthenticatedUser()") < route.indexOf("runAiGeneration("));
  assert.ok(route.indexOf("generate:") < route.indexOf("consumeAiGeneration"));
  assert.match(route, /process.env.OPENAI_API_KEY/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_OPENAI_API_KEY/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 503/);
});

test("AI planner bounds input, output, time and response caching", () => {
  assert.match(route, /length > 1200/);
  assert.match(planner, /max_output_tokens: 700/);
  assert.match(planner, /AbortSignal.timeout(15_000)/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(planner, /maxItems: 6/);
});

test("AI plan is draft-only and cannot invoke mission or external-action mutations", () => {
  assert.match(planner, /draft only/i);
  assert.doesNotMatch(route, /createSupabaseMissionRepository|mission_actions|.insert(|.update(/);
  assert.doesNotMatch(planner, /tools:s*[/);
  assert.match(component, /Nothing is executed or saved automatically/);
  assert.match(component, /Review each step before adding it to a mission/);
});

test("AI usage is enforced server-side and uncertain provider/settlement paths fail closed", () => {
  assert.match(route, /reserveAiGeneration/);
  assert.match(route, /consumeAiGeneration/);
  assert.match(route, /releaseAiGeneration/);
  assert.match(route, /x-request-id/);
  assert.match(service, /disposition: "release"/);
  assert.match(service, /disposition: "hold"/);
  assert.match(service, /SETTLEMENT_FAILED/);
  assert.match(usage, /reserve_ai_generation/);
  assert.match(usage, /get_ai_usage/);
  assert.match(component, /monthly_limit/);
  assert.match(component, /remaining/);
});

test("workspace exposes the AI planner to authenticated users", () => {
  assert.match(workspace, /AiPlanner/);
  assert.match(workspace, /<AiPlanners*/>/);
});

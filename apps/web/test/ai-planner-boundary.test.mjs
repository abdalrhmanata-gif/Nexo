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
const newMission = readFileSync(path.join(root, "app/app/missions/new/page.tsx"), "utf8");
const integratedForm = readFileSync(path.join(root, "components/mission-create-form.tsx"), "utf8");

test("AI route authenticates before invoking the provider service and keeps the key server-side", () => {
  assert.ok(route.indexOf("getAuthenticatedUser()") < route.indexOf("runAiGeneration("));
  assert.ok(route.includes("reserve: reserveAiGeneration"));
  assert.ok(route.includes("consume: consumeAiGeneration"));
  assert.ok(route.includes("release: releaseAiGeneration"));
  assert.ok(route.includes("process.env.OPENAI_API_KEY"));
  assert.equal(route.includes("NEXT_PUBLIC_OPENAI_API_KEY"), false);
  assert.ok(route.includes("ZAVQERA_AI_PROVIDER_MODE"));
  assert.ok(route.includes("status: 401"));
  assert.ok(route.includes("status: 503"));
  assert.match(route, /ZAVQERA_AI_PROVIDER_MODE/);
  assert.match(route, /providerMode === "mock"/);
  assert.ok(route.includes("buildMockMissionPlan"));
});

test("AI planner bounds input, output, time and response caching", () => {
  assert.ok(route.includes("length > 1200"));
  assert.ok(planner.includes("max_output_tokens: 450"));
  assert.ok(planner.includes("AbortSignal.timeout(24_000)"));
  assert.ok(route.includes('"Cache-Control": "no-store"'));
  assert.ok(planner.includes("maxItems: 6"));
  assert.ok(planner.includes("X-Client-Request-Id"));
});

test("AI plan is draft-only and cannot invoke mission or external-action mutations", () => {
  assert.match(planner, /draft only/i);
  assert.equal(route.includes("createSupabaseMissionRepository"), false);
  assert.equal(route.includes("mission_actions"), false);
  assert.equal(route.includes(".insert("), false);
  assert.equal(route.includes(".update("), false);
  assert.equal(planner.includes("tools: ["), false);
  assert.ok(component.includes("Nothing is executed or saved automatically"));
  assert.ok(component.includes("Review each step before adding it to a mission"));
});

test("AI usage is enforced server-side and uncertain provider/settlement paths fail closed", () => {
  for (const token of ["reserveAiGeneration", "consumeAiGeneration", "releaseAiGeneration", "x-request-id"]) {
    assert.ok(route.includes(token), token);
  }
  for (const token of ['disposition: known.kind === "unknown" ? "hold" : "release"', "SETTLEMENT_FAILED"]) {
    assert.ok(service.includes(token), token);
  }
  assert.ok(usage.includes("reserve_ai_generation"));
  assert.ok(usage.includes("get_ai_usage"));
  assert.ok(component.includes("monthly_limit"));
  assert.ok(component.includes("remaining"));
});

test("AI planning is integrated into authenticated mission creation, not duplicated on the workspace", () => {
  assert.ok(newMission.includes("MissionCreateForm"));
  assert.ok(integratedForm.includes("Build my plan"));
  assert.ok(integratedForm.includes("Tell ZAVQERA what you want."));
  assert.ok(integratedForm.includes("Want more control? Add details"));
  assert.ok(integratedForm.includes("setCriteria(plan.successCriteria.join"));
  assert.ok(integratedForm.includes("setActions(plan.steps.map"));
  assert.equal(workspace.includes("AiPlanner"), false);
});

test("deployed AI routes cannot silently fall back to the mock provider", () => {
  const anonymous = readFileSync(path.join(root, "app/api/ai/plan/anonymous/route.ts"), "utf8");
  assert.match(route, /const isProductionRuntime = process\.env\.NODE_ENV === "production"/);
  assert.match(anonymous, /const isProductionRuntime = process\.env\.NODE_ENV === "production"/);
  assert.match(route, /configuredProviderMode === "mock" && !isProductionRuntime \? "mock" : "openai"/);
  assert.match(anonymous, /configuredProviderMode === "mock" && !isProductionRuntime \? "mock" : "openai"/);
  assert.match(route, /if \(providerMode !== "mock" && !apiKey\)/);
  assert.match(anonymous, /if \(providerMode !== "mock" && !apiKey\)/);
});

test("mission creation maps AI success criteria to mission criteria and keeps AI draft versioned", () => {
  assert.ok(integratedForm.includes('setCriteria(plan.successCriteria.join("\\n"))'));
  assert.ok(integratedForm.includes('setName((current) => current || plan.title)'));
  assert.ok(integratedForm.includes('"zavqera-anonymous-plan-v2"'));
});

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
  assert.match(route, /reserve:\s*\(id\)\s*=>\s*reserveAiGeneration\(\s*id,\s*"planner"/);
  assert.match(route, /consume:\s*\(reservationId\)\s*=>\s*consumeAiGeneration\(reservationId,\s*quotaSupabaseClient\)/);
  assert.match(route, /release:\s*\(reservationId\)\s*=>\s*releaseAiGeneration\(reservationId,\s*quotaSupabaseClient\)/);
  assert.ok(route.includes("process.env.OPENAI_API_KEY"));
  assert.equal(route.includes("NEXT_PUBLIC_OPENAI_API_KEY"), false);
  assert.ok(route.includes("ZAVQERA_AI_PROVIDER_MODE"));
  assert.ok(route.includes("status: 401"));
  assert.ok(route.includes("status: 503"));
  assert.match(route, /ZAVQERA_AI_PROVIDER_MODE/);
  assert.match(route, /providerMode === "mock"/);
  assert.ok(route.includes("buildMockMissionPlan"));
});

test("authenticated and anonymous planning fail closed before quota when OPENAI_MODEL is absent", () => {
  const anonymous = readFileSync(path.join(root, "app/api/ai/plan/anonymous/route.ts"), "utf8");
  for (const [name, source] of [["authenticated", route], ["anonymous", anonymous]]) {
    const modelGate = source.indexOf('if (providerMode !== "mock" && !model)');
    assert.ok(source.includes("const model = process.env.OPENAI_MODEL?.trim();"), name);
    assert.ok(source.includes('code: "ai_model_not_configured"'), name);
    assert.ok(modelGate >= 0, name);
    assert.ok(modelGate < source.indexOf("readJsonBody(request)"), name);
    assert.equal(source.includes("process.env.OPENAI_MODEL || DEFAULT_AI_MODEL"), false, name);
  }
  assert.ok(
    route.indexOf('if (providerMode !== "mock" && !model)') < route.indexOf("runAiGeneration("),
    "authenticated route must reject missing model before quota reservation",
  );
  assert.ok(
    anonymous.indexOf('if (providerMode !== "mock" && !model)') <
      anonymous.lastIndexOf("await reserveAnonymousAiGeneration("),
    "anonymous route must reject missing model before quota reservation",
  );
});

test("AI planner bounds input, output, time and response caching", () => {
  assert.ok(route.includes("length > 2400"));
  assert.ok(planner.includes("max_output_tokens: 2000"));
  assert.ok(planner.includes("AbortSignal.timeout(24_000)"));
  assert.ok(route.includes('"Cache-Control": "no-store"'));
  assert.ok(!planner.includes("maxItems:"));
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
  assert.ok(integratedForm.includes("Draft my mission"));
  assert.ok(integratedForm.includes("Describe the outcome you want."));
  assert.ok(integratedForm.includes("Want more control? Add details"));
  assert.ok(integratedForm.includes("setCriteria(plan.successCriteria.join"));
  assert.ok(integratedForm.includes("setActions(plan.steps.map"));
  assert.equal(workspace.includes("AiPlanner"), false);
});

test("deployed AI routes cannot silently fall back to the mock provider", () => {
  const anonymous = readFileSync(path.join(root, "app/api/ai/plan/anonymous/route.ts"), "utf8");
  assert.ok(route.includes('const isProductionRuntime = process.env.NODE_ENV === "production"'));
  assert.ok(anonymous.includes('const isProductionRuntime = process.env.NODE_ENV === "production"'));
  assert.ok(route.includes('configuredProviderMode === "mock" && !isProductionRuntime ? "mock" : "openai"'));
  assert.ok(anonymous.includes('configuredProviderMode === "mock" && !isProductionRuntime ? "mock" : "openai"'));
  assert.ok(route.includes('if (providerMode !== "mock" && !apiKey)'));
  assert.ok(anonymous.includes('if (providerMode !== "mock" && !apiKey)'));
});

test("mission creation maps AI success criteria to mission criteria and keeps AI draft versioned", () => {
  assert.ok(integratedForm.includes('setCriteria(plan.successCriteria.join("\\n"))'));
  assert.ok(integratedForm.includes('setName((current) => current || plan.title)'));
  assert.ok(integratedForm.includes('"zavqera-anonymous-plan-v2"'));
});

test("mission boundaries are sent to AI drafting and persisted with the saved mission", () => {
  assert.match(integratedForm, /name="boundaries"/);
  assert.match(integratedForm, /Mission boundaries and permissions:/);
  assert.match(integratedForm, /Set budget or deadline limits, allowed sources, and actions that must stay off-limits\./);
  assert.match(newMission, /formData\.get\("boundaries"\)/);
  assert.match(newMission, /boundaries\.length > 1000/);
  assert.match(newMission, /Boundaries and permissions:/);
  assert.match(newMission, /intent: persistedIntent/);
  assert.match(route, /length > 2400/);
});

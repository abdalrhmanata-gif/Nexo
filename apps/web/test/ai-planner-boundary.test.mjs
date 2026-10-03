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
  assert.ok(route.includes("reserve: reserveAiGeneration"));
  assert.ok(route.includes("consume: consumeAiGeneration"));
  assert.ok(route.includes("release: releaseAiGeneration"));
  assert.ok(route.includes("process.env.OPENAI_API_KEY"));
  assert.equal(route.includes("NEXT_PUBLIC_OPENAI_API_KEY"), false);
  assert.ok(route.includes("ZAVQERA_AI_PROVIDER_MODE"));
  assert.ok(route.includes("status: 401"));
  assert.ok(route.includes("status: 503"));
});

test("AI planner bounds input, output, time and response caching", () => {
  assert.ok(route.includes("length > 1200"));
  assert.ok(planner.includes("max_output_tokens: 700"));
  assert.ok(planner.includes("AbortSignal.timeout(15_000)"));
  assert.ok(route.includes('"Cache-Control": "no-store"'));
  assert.ok(planner.includes("maxItems: 6"));
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

test("workspace exposes the AI planner to authenticated users", () => {
  assert.ok(workspace.includes("AiPlanner"));
});

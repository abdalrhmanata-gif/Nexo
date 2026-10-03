import assert from "node:assert/strict";
import test from "node:test";
import { buildMockMissionPlan } from "../lib/ai-mock-provider.mjs";

test("mock provider produces a deterministic draft without external calls", () => {
  const plan = buildMockMissionPlan("Plan my weekend trip");
  assert.equal(plan.steps.length, 3);
  assert.match(plan.summary, /Plan my weekend trip/);
  assert.doesNotMatch(JSON.stringify(plan), /api\.openai\.com/i);
});

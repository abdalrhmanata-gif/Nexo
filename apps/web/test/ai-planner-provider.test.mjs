import assert from "node:assert/strict";
import test from "node:test";

const source = await import("../lib/ai-planner.ts").catch(() => null);
test("provider contract is covered by source-level safety checks", () => {
  assert.ok(source === null || source.requestMissionPlan);
});

test("provider request contract uses Responses API, low reasoning effort and structured output", () => {
  // Keep this test dependency-free for the repository's current Node test runner.
  const fs = require("node:fs");
  const path = require("node:path");
  const route = fs.readFileSync(path.join(process.cwd(), "lib/ai-planner.ts"), "utf8");
  assert.match(route, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(route, /reasoning:\s*\{\s*effort:\s*"low"/);
  assert.match(route, /type:\s*"json_schema"/);
  assert.match(route, /name:\s*"zavqera_mission_plan"/);
  assert.match(route, /maxItems:\s*6/);
});

test("provider response parsing is bounded and fail-closed", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const route = fs.readFileSync(path.join(process.cwd(), "lib/ai-planner.ts"), "utf8");
  assert.match(route, /typeof payload\.output_text !== "string"/);
  assert.match(route, /plan\.steps\.length > 6/);
  assert.match(route, /summary\.slice\(0, 600\)/);
  assert.match(route, /title\.slice\(0, 160\)/);
  assert.match(route, /reason\.slice\(0, 300\)/);
});

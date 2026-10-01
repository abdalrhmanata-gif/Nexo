import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(webRoot, "lib/ai-planner.ts"), "utf8");

test("provider request contract uses Responses API, low reasoning effort and structured output", () => {
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(source, /reasoning:\s*\{\s*effort:\s*"low"/);
  assert.match(source, /type:\s*"json_schema"/);
  assert.match(source, /name:\s*"zavqera_mission_plan"/);
  assert.match(source, /maxItems:\s*6/);
});

test("provider response parsing is bounded and fail-closed", () => {
  assert.match(source, /typeof payload\.output_text !== "string"/);
  assert.match(source, /plan\.steps\.length > 6/);
  assert.match(source, /summary\.slice\(0, 600\)/);
  assert.match(source, /title\.slice\(0, 160\)/);
  assert.match(source, /reason\.slice\(0, 300\)/);
  assert.match(source, /AbortSignal\.timeout\(15_000\)/);
});

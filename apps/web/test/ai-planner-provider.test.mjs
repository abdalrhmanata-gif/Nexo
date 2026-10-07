import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(webRoot, "lib/ai-planner.ts"), "utf8");

test("provider request contract uses Responses API, low reasoning effort and structured output with a Netlify-safe timeout", () => {
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(source, /reasoning:\s*\{\s*effort:\s*"none"/);
  assert.match(source, /type:\s*"json_schema"/);
  assert.match(source, /name:\s*"zavqera_mission_plan"/);
  assert.match(source, /maxItems:\s*6/);
  assert.match(source, /store:\s*false/);
  assert.match(source, /X-Client-Request-Id/);
});

test("provider response parsing is bounded and fail-closed", () => {
  assert.match(source, /typeof payload\.output_text !== "string"/);
  assert.match(source, /plan\.steps\.length > 6/);
  assert.match(source, /summary\.trim\(\)\.slice\(0, 600\)/);
  assert.match(source, /step\.title\.trim\(\)\.slice\(0, 160\)/);
  assert.match(source, /step\.reason\.trim\(\)\.slice\(0, 300\)/);
  assert.match(source, /AbortSignal\.timeout\(24_000\)/);
});

test("mission plan contract is outcome-driven and rejects generic template-only behavior", () => {
  assert.match(source, /title:\s*\{ type: "string" \}/);
  assert.match(source, /successCriteria:/);
  assert.match(source, /clarifyingQuestions:/);
  assert.match(source, /3 to 6 ordered first steps/);
  assert.match(source, /Avoid generic placeholder steps/);
  assert.match(source, /plan\.steps\.length < 3/);
  assert.match(source, /successCriteria\.length < 1/);
  assert.match(source, /successCriteria\.length > 4/);
});

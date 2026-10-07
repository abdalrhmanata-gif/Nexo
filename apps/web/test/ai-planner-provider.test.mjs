import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(webRoot, "lib/ai-planner.ts"), "utf8");

test("provider request contract uses Responses API, no reasoning, low verbosity and structured output with a Netlify-safe timeout", () => {
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(source, /reasoning:\s*\{\s*effort:\s*"none"/);
  assert.match(source, /type:\s*"json_schema"/);
  assert.match(source, /name:\s*"zavqera_mission_plan"/);
  assert.match(source, /maxItems:\s*6/);\n  assert.match(source, /max_output_tokens:\s*450/);\n  assert.match(source, /verbosity:\s*"low"/);
  assert.match(source, /store:\s*false/);
  assert.match(source, /X-Client-Request-Id/);
});

test("provider response parsing is bounded and fail-closed", () => {
  assert.match(source, /function extractOutputText/);
  assert.match(source, /plan\.steps\.length > 6/);
  assert.match(source, /summary\.trim\(\)\.slice\(0, 600\)/);
  assert.match(source, /step\.title\.trim\(\)\.slice\(0, 160\)/);
  assert.match(source, /step\.reason\.trim\(\)\.slice\(0, 300\)/);
  assert.match(source, /AbortSignal\.timeout\(24_000\)/);\n  assert.match(source, /part\.type === "output_text"/);
});

test("mission plan contract is outcome-driven and rejects generic template-only behavior", () => {
  assert.match(source, /title:\s*\{ type: "string" \}/);
  assert.match(source, /successCriteria:/);
  assert.match(source, /clarifyingQuestions:/);
  assert.match(source, /3-6 ordered steps/);
  assert.match(source, /Avoid generic placeholders/);
  assert.match(source, /plan\.steps\.length < 3/);
  assert.match(source, /successCriteria\.length < 1/);
  assert.match(source, /successCriteria\.length > 4/);
});

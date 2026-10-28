import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("monthly AI prices and generation allowances are clearly planning-only", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /launch-planning estimates/);
  assert.match(pricing, /Paid billing and monthly usage enforcement are not enabled/);
  assert.match(pricing, /planned AI generations per month/);
  assert.match(pricing, /Planned allowance; not enforced yet/);
  assert.doesNotMatch(pricing, /Hard monthly AI limit/);
});

test("pricing explains current Opportunity Intelligence separation from AI-generation allowances", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /Opportunity Intelligence is included in this early-access experience/);
  assert.match(pricing, /does not call ZAVQERA's AI-generation service/);
  assert.match(pricing, /does not use the planned monthly AI-generation allowance/);
  assert.match(pricing, /future plan entitlements/);
  assert.match(pricing, /href="\/app\/opportunities"/);
});

test("Opportunity Intelligence implementation remains local-first and does not call a generation API", () => {
  const feature = read("components/opportunity-intelligence.tsx");
  assert.match(feature, /scoreOpportunity\(/);
  assert.match(feature, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(feature, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(feature, /\bfetch\s*\(/);
  assert.doesNotMatch(feature, /createSupabase|openai|anthropic/i);
});

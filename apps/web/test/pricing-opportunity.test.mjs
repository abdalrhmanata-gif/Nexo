import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("monthly Opportunity Intelligence prices and report allowances are explicitly proposed, not live", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /Proposed launch pricing, not active offers/);
  assert.match(pricing, /Paid billing, AI Opportunity Briefs, and usage enforcement are not enabled yet/);
  assert.match(pricing, /\$19/);
  assert.match(pricing, /\$49/);
  assert.match(pricing, /AI Opportunity Briefs per month \(planned\)/);
  assert.match(pricing, /10 AI Opportunity Briefs per month \(planned\)/);
  assert.match(pricing, /30 AI Opportunity Briefs per month \(planned\)/);
  assert.match(pricing, /planned prices and report limits are hypotheses|prices are hypotheses/i);
});

test("pricing positions Opportunity Intelligence as part of the monthly plan without pretending AI is live", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /inside the monthly plan—not as a surprise add-on/);
  assert.match(pricing, /AI analyst described in these proposed plans is not connected yet/);
  assert.match(pricing, /Every material factual claim must cite a source or be clearly labeled as an inference or unknown/);
  assert.match(pricing, /href="\/app\/opportunities"/);
  assert.match(pricing, /market monitoring and alerts \(later phase\)/);
});

test("current Opportunity Intelligence remains local-first and does not call an AI-generation API", () => {
  const feature = read("components/opportunity-intelligence.tsx");
  assert.match(feature, /scoreOpportunity\(/);
  assert.match(feature, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(feature, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(feature, /\bfetch\s*\(/);
  assert.doesNotMatch(feature, /createSupabase|openai|anthropic/i);
});

test("AI Opportunity Intelligence product strategy records evidence rules, phases, and release gates", () => {
  const strategyPath = join(repoRoot, "docs", "OPPORTUNITY_INTELLIGENCE_PRODUCT_STRATEGY.md");
  assert.equal(existsSync(strategyPath), true);
  const strategy = readFileSync(strategyPath, "utf8");
  assert.match(strategy, /evidence-to-execution intelligence/i);
  assert.match(strategy, /Every material factual claim has a source URL/);
  assert.match(strategy, /Phase 1 — useful AI analysis on reviewed evidence/);
  assert.match(strategy, /Release gates/);
  assert.match(strategy, /not currently available features/i);
});

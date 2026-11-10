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
  assert.match(pricing, /Paid billing and usage enforcement are not enabled; AI Opportunity Brief access is restricted to an approved preview tester/);
  assert.match(pricing, /\$19/);
  assert.match(pricing, /\$49/);
  // The quota is shared: a mission plan and an opportunity brief both spend
  // one generation, so the allowance must name both or it understates what
  // the plan buys.
  assert.match(pricing, /AI briefs or Mission plans per month \(planned\)/);
  assert.match(pricing, /10 AI briefs or Mission plans per month \(planned\)/);
  assert.match(pricing, /30 AI briefs or Mission plans per month \(planned\)/);
  assert.match(pricing, /90 AI briefs or Mission plans per month \(planned\)/);
  // Every tier stays marked as proposed, the fourth included.
  assert.match(pricing, /name: "Scale"/);
  assert.match(pricing, /price: "\$69"/);
  assert.match(pricing, /planned prices and report limits are hypotheses|prices are hypotheses/i);
});

test("pricing positions Opportunity Intelligence as part of the monthly plan without pretending AI is live", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /inside the monthly plan—not as a surprise add-on/);
  assert.match(pricing, /guarded server-side AI analyst route exists for restricted preview access only\. It is not generally available/i);
  assert.match(pricing, /each factual claim must cite a source or be clearly labeled as an inference or unknown/);
  assert.match(pricing, /href="\/app\/opportunities"/);
  assert.match(pricing, /Market monitoring and alerts/i);
});

test("current Opportunity Intelligence remains local-first and does not call an AI-generation API", () => {
  const feature = read("components/opportunity-intelligence.tsx");
  assert.match(feature, /scoreOpportunity\(/);
  assert.match(feature, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(feature, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(feature, /\bfetch\s*\(/);
  assert.doesNotMatch(feature, /createSupabase|openai|anthropic/i);
});


test("Opportunity Intelligence exposes safe local backup and non-overwriting import controls", () => {
  const feature = read("components/opportunity-intelligence.tsx");
  const portability = read("lib/opportunity-portability.mjs");
  assert.match(feature, /createOpportunityBackup\(opportunities\)/);
  assert.match(feature, /parseOpportunityBackup\(await file\.text\(\)\)/);
  assert.match(feature, /accept="\.json,application\/json"/);
  assert.match(feature, /mergeOpportunityBackup\(current, backupPreview\)\.opportunities/);
  assert.match(portability, /existingIds = new Set\(currentOpportunities/);
  assert.match(portability, /skippedCount: backup\.opportunities\.length - additions\.length/);
  assert.match(feature, /no existing records were overwritten/i);
  assert.match(feature, /Cloud sync, live discovery.*not connected yet/i);
  assert.match(portability, /MAX_OPPORTUNITY_BACKUP_BYTES/);
  assert.match(portability, /item\.evidenceUrl && !isHttpSourceUrl/);
});

test("saved opportunities keep the radar primary and capture stays one click away", () => {
  const feature = read("components/opportunity-intelligence.tsx");
  const styles = read("app/globals.css");
  assert.match(feature, /const \[isOpportunityFormOpen, setIsOpportunityFormOpen\] = useState\(true\)/);
  assert.match(feature, /setIsOpportunityFormOpen\(opportunities\.length === 0\)/);
  assert.match(feature, /aria-expanded=\{isOpportunityFormOpen\}/);
  assert.match(feature, /aria-controls="add-opportunity-card"/);
  assert.match(feature, /opportunity-layout--form-collapsed/);
  assert.match(feature, /Add your first opportunity to begin comparing options\./);
  assert.match(styles, /\.opportunity-layout--form-collapsed\s*\{\s*grid-template-columns:minmax\(0,1fr\);/);
  assert.match(styles, /opportunity-layout--form-open \.opportunity-form-card \{ order:1; \}/);
});

test("AI Opportunity Intelligence product strategy records evidence rules, phases, and release gates", () => {
  const strategyPath = join(repoRoot, "docs", "OPPORTUNITY_INTELLIGENCE_PRODUCT_STRATEGY.md");
  assert.equal(existsSync(strategyPath), true);
  const strategy = readFileSync(strategyPath, "utf8");
  assert.match(strategy, /evidence-to-execution intelligence/i);
  assert.match(strategy, /Every material factual claim has a source URL/);
  assert.match(strategy, /Phase 1 — useful AI analysis on reviewed evidence/);
  assert.match(strategy, /Release gates/);
  assert.match(strategy, /not a statement that planned AI capabilities are live/i);
});

test("the pricing grid does not hard-code a column count", () => {
  // The grid was repeat(3, …). Adding a fourth plan left it alone on a
  // second row, which looks like a bug rather than a tier. A fixed count has
  // to be revisited every time the ladder changes, and will not be.
  const css = readFileSync(join(webRoot, "app/globals.css"), "utf8");
  const rule = /\.pricing-grid \{[^}]*grid-template-columns:([^;]+);/.exec(css);
  assert.ok(rule, "the pricing grid rule has moved");
  assert.doesNotMatch(rule[1], /repeat\(\s*\d/,
    "the column count must follow the number of plans, not a number in the stylesheet");
  assert.match(rule[1], /auto-fit|auto-fill/);
});

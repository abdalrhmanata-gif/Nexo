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

test("Opportunity Intelligence keeps its records in the account and does not call an AI-generation API", () => {
  const feature = read("components/opportunity-intelligence.tsx");
  const repository = read("lib/supabase/opportunity-repository.ts");
  assert.match(feature, /scoreOpportunity\(/);
  assert.match(feature, /await listAccountOpportunities\(\)/);
  assert.match(feature, /await addAccountOpportunity\(opportunity\)/);
  assert.match(feature, /await removeAccountOpportunity\(opportunityId\)/);
  assert.doesNotMatch(feature, /\bfetch\s*\(/);
  assert.doesNotMatch(feature, /openai|anthropic/i);
  // The person's own session, and nothing else, decides whose rows these are.
  assert.match(repository, /createSupabaseBrowserClient\(\)/);
  assert.doesNotMatch(repository, /service_role|\.update\(|\.rpc\(/);
  assert.doesNotMatch(repository, /user_id\s*:|\.eq\("user_id"/, "no call names a user; the database takes the owner from the session");
});

test("the browser's old copy is read once for the move and never written or erased", () => {
  const feature = read("components/opportunity-intelligence.tsx");
  assert.match(feature, /localStorage\.getItem\(BROWSER_OPPORTUNITY_KEY\)/);
  assert.doesNotMatch(feature, /localStorage\.setItem\(BROWSER_OPPORTUNITY_KEY/);
  assert.doesNotMatch(feature, /localStorage\.(removeItem|clear)\(/, "what was recorded before the move stays where it was");
  // The marker is written after the upload, so a failed upload is retried.
  const upload = feature.indexOf("await addAccountOpportunities(plan.opportunityRows, plan.evidenceRows)");
  const marker = feature.indexOf("localStorage.setItem(BROWSER_UPLOAD_MARKER_KEY");
  assert.ok(upload > -1 && marker > upload, "the marker must be set only after the upload succeeded");
  assert.match(feature, /if \(window\.localStorage\.getItem\(BROWSER_UPLOAD_MARKER_KEY\)\) return NOTHING_UPLOADED/);
});

test("the migration that stores opportunities only adds, and closes both tables by default", () => {
  const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20261113160000_opportunities_account_storage.sql"), "utf8");
  const statements = migration.replace(/--.*$/gm, "");
  for (const table of ["opportunities", "opportunity_evidence_items"]) {
    assert.match(statements, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(statements, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
    assert.match(statements, new RegExp(`grant select, insert, delete on table public\\.${table} to authenticated`));
  }
  assert.doesNotMatch(statements, /\bto anon\b|\bto public\b/);
  assert.doesNotMatch(statements, /drop table|truncate|delete from|drop column|drop schema/i, "nothing existing is removed");
  for (const [, table] of statements.matchAll(/alter table public\.(\w+)/g)) {
    assert.ok(["opportunities", "opportunity_evidence_items"].includes(table), `the migration alters an existing table: ${table}`);
  }
  // Every policy is scoped to the session's own user.
  const policies = [...statements.matchAll(/create policy[^;]+;/g)].map((match) => match[0]);
  assert.equal(policies.length, 6);
  for (const policy of policies) {
    assert.match(policy, /to authenticated/);
    assert.match(policy, /user_id = \(select auth\.uid\(\)\)/);
  }
});

test("Opportunity Intelligence exposes a safe backup and non-overwriting import controls", () => {
  const feature = read("components/opportunity-intelligence.tsx");
  const portability = read("lib/opportunity-portability.mjs");
  assert.match(feature, /createOpportunityBackup\(opportunities\)/);
  assert.match(feature, /parseOpportunityBackup\(await file\.text\(\)\)/);
  assert.match(feature, /accept="\.json,application\/json"/);
  assert.match(feature, /mergeOpportunityBackup\(current, backupPreview\)\.opportunities/);
  assert.match(portability, /existingIds = new Set\(currentOpportunities/);
  assert.match(portability, /skippedCount: backup\.opportunities\.length - additions\.length/);
  assert.match(feature, /no existing records were overwritten/i);
  assert.match(feature, /saved to your account, visible only to you/);
  assert.match(feature, /Live discovery.*not connected yet/);
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

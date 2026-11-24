import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("the pricing page lists the live prices, the shared allowance and only features that exist", () => {
  const pricing = read("app/pricing/page.tsx");
  for (const price of ['price: "$0"', 'price: "$19"', 'price: "$49"', 'price: "$69"']) assert.ok(pricing.includes(price), price);
  // The quota is shared: a mission plan and an opportunity brief both spend
  // one draft, so the page must say what a draft is or it understates what
  // the plan buys.
  assert.match(pricing, /AI drafts per month/);
  assert.match(pricing, /What counts as an AI draft\?/);
  assert.match(pricing, /ask the AI for a Mission plan or an opportunity brief, that is one draft/);
  for (const unbuilt of [/Market monitoring/i, /Compare up to/i, /Exportable decision reports/i, /source-linked/i]) {
    assert.doesNotMatch(pricing, unbuilt, "a feature that does not exist is not sold");
  }
});

test("the pricing page says plainly that the AI drafts and the person decides", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /The AI drafts and you decide\. Nothing is added to a Mission until you choose to add it\./);
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

test("every 'unlimited' on the pricing page is true: no feature is gated by plan, and the AI is the only allowance", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /Unlimited Missions and plans/);
  // Opportunities have a storage cap per account (1000), so they are never sold as unlimited.
  assert.doesNotMatch(pricing, /Unlimited (opportunit|evidence|AI)/i);
  // Nothing outside checkout asks which plan a person is on, so Free really has every feature.
  const gated = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(webRoot, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(tsx?|mjs)$/.test(entry.name) && /isPaidPlan\(|hasOwnTemplates\(|calendarLimit\(|\.plan === "(plus|pro|scale)"/.test(readFileSync(join(webRoot, rel), "utf8"))) gated.push(rel);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(dir);
  // The one feature gated by plan is own templates (Pro and Scale), and the
  // pricing page says so; anything else gated would make "every plan" untrue.
  // The calendar link is the other: how many Missions it carries (1, 3, all).
  const OWN_TEMPLATE_FILES = ["app/app/missions/[id]/page.tsx", "app/app/templates/actions.ts", "app/app/templates/page.tsx", "lib/own-templates.mjs"];
  const CALENDAR_FILES = ["app/app/calendar/page.tsx", "components/plan-dates-card.tsx", "lib/plan-dates.mjs"];
  assert.deepEqual(gated.filter((file) => !/billing|checkout|stripe/.test(file) && !OWN_TEMPLATE_FILES.includes(file) && !CALENDAR_FILES.includes(file)).sort(), [], "a feature is gated by plan; the pricing page would no longer be true");
  // The terms carry the fair-use sentence the FAQ points to.
  const terms = read("app/terms/page.tsx");
  assert.match(terms, /Where a plan says something is unlimited/);
  assert.match(pricing, /We only ask for fair use, as our terms explain\./);
});

test("the per-day wording and the price per draft follow the real allowances", async () => {
  const { PLAN_LIMITS, pricePerDraft } = await import("../lib/billing-plans.mjs");
  assert.deepEqual({ ...PLAN_LIMITS }, { free: 2, plus: 10, pro: 30, scale: 90 }, "the allowances changed: update 'every few days', 'one a day', 'three a day'");
  assert.equal(pricePerDraft(19, PLAN_LIMITS.plus), "$1.90");
  assert.equal(pricePerDraft(49, PLAN_LIMITS.pro), "$1.63");
  assert.equal(pricePerDraft(69, PLAN_LIMITS.scale), "$0.77");
  const pricing = read("app/pricing/page.tsx");
  for (const [plan, price] of [["plus", 19], ["pro", 49], ["scale", 69]]) {
    assert.match(pricing, new RegExp(`monthly: ${price},\\s*reports: PLAN_LIMITS\\.${plan}`), plan);
  }
  // Teammates do not share the payer's drafts: the quota is per person in the database.
  assert.match(pricing, /AI drafts belong to each person's own plan/);
  assert.doesNotMatch(pricing, /For teams that plan every day|For freelancers and small teams/);
});

test("own templates are sold only where they exist: on Pro and Scale, after the feature shipped", async () => {
  const pricing = read("app/pricing/page.tsx");
  const card = (name) => pricing.slice(pricing.indexOf(`name: "${name}"`), pricing.indexOf("},", pricing.indexOf("features:", pricing.indexOf(`name: "${name}"`))));
  for (const name of ["Pro", "Scale"]) assert.match(card(name), /"Your own templates: save any Mission, reuse it in one press"/, name);
  for (const name of ["Free", "Plus"]) assert.doesNotMatch(card(name), /Your own templates/, name);
  assert.match(pricing, /What are your own templates\?/);
  // The claims in the answer are the database's rules.
  assert.match(pricing, /keep up to 100, and they are private to you/);
  const { OWN_TEMPLATE_LIMIT, OWN_TEMPLATE_PLANS } = await import("../lib/own-templates.mjs");
  assert.match(pricing, new RegExp(`keep up to ${OWN_TEMPLATE_LIMIT},`));
  const sql = readFileSync(join(repoRoot, "supabase/migrations/20261124150000_own_templates.sql"), "utf8");
  assert.match(sql, new RegExp(`>= ${OWN_TEMPLATE_LIMIT} then`));
  assert.match(sql, new RegExp(`e\\.plan in \\('${OWN_TEMPLATE_PLANS[0]}', '${OWN_TEMPLATE_PLANS[1]}'\\)`));
});

test("the calendar is sold as it works: 1, 3, every Mission, with Google's daily check said plainly", async () => {
  const pricing = read("app/pricing/page.tsx");
  const { CALENDAR_LIMITS } = await import("../lib/plan-dates.mjs");
  assert.deepEqual({ ...CALENDAR_LIMITS }, { free: 1, plus: 3, pro: null, scale: null }, "update the pricing page with the limits");
  const card = (name) => pricing.slice(pricing.indexOf(`name: "${name}"`), pricing.indexOf("],", pricing.indexOf("features:", pricing.indexOf(`name: "${name}"`))));
  assert.match(card("Free"), /"Your plan in Google, Apple or Outlook calendar: 1 Mission"/);
  assert.match(card("Plus"), /"Your calendar: 3 Missions"/);
  for (const name of ["Pro", "Scale"]) assert.match(card(name), /"Your calendar: every Mission"/, name);
  assert.match(pricing, /Free holds 1 Mission, Plus 3, Pro and Scale every Mission\. Google checks the link about once a day/);
  // Every feature on the cards exists: the dates and calendar files are in place.
  for (const file of ["app/app/calendar/page.tsx", "app/api/calendar/[file]/route.ts", "components/plan-dates-card.tsx", "lib/legal-deadlines.ts"]) {
    assert.ok(existsSync(join(webRoot, file)), file);
  }
});

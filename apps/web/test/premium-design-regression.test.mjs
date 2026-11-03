import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { translateUiText } from "../lib/ui-translations.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("Design A keeps a responsive Mission Control hero without horizontal clipping", () => {
  const css = read("app/globals.css");
  const page = read("app/page.tsx");
  assert.match(css, /html, body \{ max-width:100%; overflow-x:clip; \}/);
  assert.match(css, /\.landing-hero\s*\{[\s\S]*grid-template-columns:minmax\(0,1\.02fr\) minmax\(0,\.98fr\)/);
  assert.match(css, /@media \(max-width:1180px\)[\s\S]*\.landing-hero\s*\{ grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /@media \(max-width:760px\)[\s\S]*\.primary-nav\s*\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(page, /className="landing-visual"/);
  assert.match(page, /className="landing-product-value"/);
});

test("Landing page explains current value and sends new users to free sign-up", () => {
  const page = read("app/page.tsx");
  assert.match(page, /href="\/auth\/sign-up"><LocalizedText en="Start free"/);
  assert.match(page, /What you can use today/);
  assert.match(page, /A Mission makes your AI work reviewable\./);
  assert.match(page, /A clear starting point/);
  assert.match(page, /A visible path/);
  assert.match(page, /A decision you can explain/);
  assert.match(page, /Opportunity scoring and evidence notes are stored in this browser/);
});

test("every new Design A message has complete six-language copy", () => {
  const keys = [
    "What you can use today",
    "A Mission makes your AI work reviewable.",
    "Set an outcome, track next steps, and keep the evidence behind each decision in one place.",
    "Explore proposed plans",
    "A clear starting point",
    "Define what success means before work begins.",
    "A visible path",
    "Track actions, blockers and the next decision in one workspace.",
    "A decision you can explain",
    "Keep supporting evidence and open questions together.",
    "Opportunity scoring and evidence notes are stored in this browser. Cloud sync and live research are not connected yet. AI Opportunity Briefs are restricted to approved preview testers; paid billing is not enabled.",
    "Sign in",
    "Available now",
    "Start with the free workspace today. Plus and Pro are design proposals, not plans you can purchase yet."
  ];
  for (const language of ["nb", "ar", "es", "fr", "de"]) {
    for (const key of keys) assert.notEqual(translateUiText(language, key), key, `missing ${language} translation for ${key}`);
  }
});

test("pricing distinguishes available free access from proposed paid plans", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /pricing-state-live/);
  assert.match(pricing, /pricing-state-planned/);
  assert.match(pricing, /plan\.cta \? "Available now" : "Planned for launch"/);
  assert.match(pricing, /Paid billing and usage enforcement are not enabled/);
  assert.match(pricing, /not plans you can purchase yet/);
  assert.match(pricing, /href="\/auth\/sign-up"/);
});


test("shared navigation shows sign-in to anonymous visitors and sign-out only for authenticated users", () => {
  const shell = read("components/shell.tsx");
  assert.match(shell, /getAuthenticatedUser/);
  assert.match(shell, /const user = await getAuthenticatedUser\(\)\.catch\(\(\) => null\)/);
  assert.ok(shell.includes("const user = await getAuthenticatedUser().catch(() => null);"));
  assert.ok(shell.includes("? <SignOutButton />"));
  assert.ok(shell.includes(': <Link className="button button-small" href="/auth/sign-in">'));
});

test("the Netlify workflow grants only the dedicated design branch a draft preview path", () => {
  const workflow = read("../../.github/workflows/web-deploy-netlify.yml");
  assert.match(workflow, /codex\/zavqera-premium-mission-control-design-20261101/);
  assert.match(workflow, /deploy --build --context deploy-preview/);
  assert.doesNotMatch(workflow, /--prod(?:uction)?\b/);
});

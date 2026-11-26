import assert from "node:assert/strict";
import test from "node:test";
import { SOURCE_URL, buildLlmsTxt, pricingSentence } from "../lib/llms-txt.mjs";
import { PLAN_LIMITS } from "../lib/billing-plans.mjs";
import { FEATURES, PLAN_PRICES_USD, PROFILES, SITE_DESCRIPTION } from "../lib/site-schema.mjs";
import { checklistPath, checklists } from "../lib/checklists.mjs";

// /llms.txt follows the llmstxt.org shape and repeats only facts that the
// site's own data holds.

const sample = buildLlmsTxt({
  checklists: checklists.map((item) => ({ title: item.title, url: checklistPath(item.slug), description: item.metaDescription })),
  comparisons: [{ title: "ZAVQERA vs Trello", url: "/compare/zavqera-vs-trello", description: "A comparison." }],
});

test("it starts with the name and a one-line summary", () => {
  const lines = sample.split("\n");
  assert.equal(lines[0], "# ZAVQERA");
  assert.equal(lines[2], `> ${SITE_DESCRIPTION}`);
});

test("prices and AI drafts match the pricing data", () => {
  for (const [name, price] of Object.entries(PLAN_PRICES_USD)) {
    assert.ok(pricingSentence().includes(`${name} $${price} (${PLAN_LIMITS[name.toLowerCase()]} AI drafts a month)`), name);
  }
  assert.ok(sample.includes(pricingSentence()));
});

test("every feature, profile and checklist is there, with absolute links", () => {
  for (const feature of FEATURES) assert.ok(sample.includes(`- ${feature}`), feature);
  for (const profile of PROFILES) assert.ok(sample.includes(`](${profile})`), profile);
  assert.ok(sample.includes(`](${SOURCE_URL})`), "the source code link");
  assert.equal(SOURCE_URL, "https://github.com/abdalrhmanata-gif/zavqera");
  for (const item of checklists) assert.ok(sample.includes(`](https://zavqera.com${checklistPath(item.slug)})`), item.slug);
  const links = [...sample.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  assert.ok(links.length > 15);
  for (const link of links) assert.match(link, /^(https:\/\/|mailto:)/, link);
});

test("it says what ZAVQERA does not do, and has no empty sections", () => {
  assert.match(sample, /does not browse the web and never acts for the user/);
  assert.match(sample, /not a file upload/);
  assert.doesNotMatch(sample, /## Guides/, "an empty list leaves its section out");
  assert.match(sample, /## Comparisons\n\n- \[ZAVQERA vs Trello\]/);
});

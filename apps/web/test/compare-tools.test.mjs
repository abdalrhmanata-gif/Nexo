import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  TOOL_COMPARISONS,
  ZAVQERA_FACTS,
  checkedDate,
  toolComparisonBySlug,
  toolComparisonPath,
  zavqeraCell,
} from "../lib/compare-tools.mjs";
import { checklists } from "../lib/checklists.mjs";
import { PLAN_PRICES_USD } from "../lib/site-schema.mjs";

// Pages about other companies' products. The rules from the header of
// lib/compare-tools.mjs are checked here.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("slugs are unique, hyphenated and start with zavqera-vs-", () => {
  const slugs = TOOL_COMPARISONS.map((item) => item.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) assert.match(slug, /^zavqera-vs-[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(toolComparisonPath("zavqera-vs-trello"), "/compare/zavqera-vs-trello");
  assert.equal(toolComparisonPath(), "/compare");
  assert.equal(toolComparisonBySlug("nope"), undefined);
});

test("every statement about the other product cites a source on that company's own site", () => {
  for (const item of TOOL_COMPARISONS) {
    const keys = Object.keys(item.sources);
    assert.ok(keys.length > 0, item.slug);
    for (const { url } of Object.values(item.sources)) {
      const { protocol, hostname } = new URL(url);
      assert.equal(protocol, "https:", url);
      assert.ok(item.hosts.includes(hostname), `${url} is not on ${item.competitor}'s own site`);
    }
    const cited = [...item.rows.map((row) => row.source).filter(Boolean), ...item.theyDoWell.map((point) => point.source)];
    for (const key of cited) assert.ok(keys.includes(key), `${item.slug}: source "${key}" is not defined`);
    for (const key of keys) assert.ok(cited.includes(key), `${item.slug}: source "${key}" is never cited`);
    for (const row of item.rows) {
      if (!row.source) assert.equal(row.them, "Not compared here.", `${item.slug}: "${row.feature}" says something about ${item.competitor} without a source`);
    }
    for (const point of item.theyDoWell) assert.ok(point.source, `${item.slug}: a strength has no source`);
  }
});

test("each page records the date its sources were read", () => {
  for (const item of TOOL_COMPARISONS) {
    assert.match(item.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(item.checked)));
  }
  assert.equal(checkedDate("2026-11-26"), "26 November 2026");
});

test("search title and description fit in a result", () => {
  for (const item of TOOL_COMPARISONS) {
    assert.ok(item.metaTitle.length <= 60, `${item.slug}: title is ${item.metaTitle.length} characters`);
    assert.ok(item.metaDescription.length <= 160, `${item.slug}: description is ${item.metaDescription.length} characters`);
    assert.ok(item.metaTitle.includes(item.competitor) && item.metaTitle.includes("ZAVQERA"));
  }
});

test("ZAVQERA's own claims are its real prices and say what it does not do", () => {
  for (const price of Object.values(PLAN_PRICES_USD).filter((value) => value > 0)) {
    assert.ok(ZAVQERA_FACTS.price.includes(`$${price}`), `price $${price} missing`);
  }
  assert.ok(ZAVQERA_FACTS.checklists.startsWith(`${checklists.length} `));
  const gaps = ZAVQERA_FACTS.gaps.join(" ");
  for (const word of [/file uploads/i, /approval/i, /recurrence/i, /Zapier/]) assert.match(gaps, word);
  // A ZAVQERA cell names a fact or is its own sentence; never empty.
  for (const item of TOOL_COMPARISONS) for (const row of item.rows) assert.ok(zavqeraCell(row.zavqera).length > 10);
  assert.equal(zavqeraCell("proof"), ZAVQERA_FACTS.proof);
  assert.equal(zavqeraCell("gaps"), "gaps", "only sentences are cells");
});

test("nothing on the pages promises features ZAVQERA lacks", () => {
  const ours = TOOL_COMPARISONS.flatMap((item) => [
    ...item.rows.map((row) => zavqeraCell(row.zavqera)),
    item.choose.zavqera,
  ]).join(" ");
  assert.doesNotMatch(ours, /upload files|attach files|approves|automatically every|integrates with (?:Slack|Zapier)/i);
});

test("the pages are in the sitemap, the index, llms.txt and linked from the home page", () => {
  assert.match(read("app/sitemap.ts"), /TOOL_COMPARISONS/);
  assert.match(read("app/compare/page.tsx"), /TOOL_COMPARISONS/);
  assert.match(read("app/llms.txt/route.ts"), /TOOL_COMPARISONS/);
  assert.match(read("app/compare/[slug]/page.tsx"), /generateStaticParams/);
  assert.ok(read("app/page.tsx").includes('href="/compare"'), "home page does not link to the comparisons");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

// The comparison page talks about other companies' products. A wrong claim
// there costs more trust than the page earns, so every statement about
// ChatGPT, Claude or Gemini must point at that company's own help page.
// The rules from the header of lib/compare.ts are checked here.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const body = read("lib/compare.ts");

const OFFICIAL_HOSTS = ["help.openai.com", "support.claude.com", "support.google.com"];

test("every statement about another product cites a defined source", () => {
  const defined = new Set([...body.matchAll(/^ {2}(\w+): \{ label: "/gm)].map((match) => match[1]));
  const cited = [...body.matchAll(/source: "(\w+)"/g)].map((match) => match[1]);
  assert.ok(defined.size > 0 && cited.length > 0, "the reader of this test has stopped matching");
  for (const key of cited) assert.ok(defined.has(key), `source "${key}" is cited but not defined`);
  for (const key of defined) assert.ok(cited.includes(key), `source "${key}" is defined but never cited`);
});

test("sources are the companies' own help pages", () => {
  const urls = [...body.matchAll(/url: "([^"]+)"/g)].map((match) => match[1]);
  assert.ok(urls.length > 0);
  for (const url of urls) {
    const { protocol, hostname } = new URL(url);
    assert.equal(protocol, "https:", url);
    assert.ok(OFFICIAL_HOSTS.includes(hostname), `${url} is not an official help page`);
  }
});

test("search title and description fit in a result", () => {
  const title = /metaTitle: "([^"]+)"/.exec(body)[1];
  const description = /metaDescription: "([^"]+)"/.exec(body)[1];
  assert.ok(title.length <= 60, `title is ${title.length} characters`);
  assert.ok(description.length <= 160, `description is ${description.length} characters`);
});

test("the page records when the sources were checked", () => {
  assert.match(body, /checked: "\d{4}-\d{2}-\d{2}"/);
});

test("the comparison page is in the sitemap and linked from the home page", () => {
  assert.match(read("app/sitemap.ts"), /COMPARE_PATH/);
  const path = /COMPARE_PATH = "([^"]+)"/.exec(body)[1];
  assert.ok(read("app/page.tsx").includes(`href="${path}"`), "home page does not link to the comparison");
  assert.ok(read(`app${path}/page.tsx`).length > 0);
});

test("the home page does not present ZAVQERA as a US-only product", () => {
  // Owner's decision, 23 Nov 2026: ZAVQERA is global. The US guides stay
  // reachable from the footer, not from the home page.
  const home = read("app/page.tsx");
  assert.doesNotMatch(home, /\bin the US\b|United States|GuidesHomeSection/);
});

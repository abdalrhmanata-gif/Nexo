import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

// The public guides are written to be found in search and acted on. A wrong
// fee or a dead official link on one of them does more harm than no page, so
// the rules from the header of lib/guides.ts are checked here.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const source = read("lib/guides.ts");

const slugs = [...source.matchAll(/^\s{4}slug: "([^"]+)",$/gm)].map((match) => match[1]);
const urls = [...source.matchAll(/url: "([^"]+)"/g)].map((match) => match[1]);

test("there are guides, each with a unique, URL-safe slug", () => {
  assert.ok(slugs.length >= 5, `expected at least five guides, found ${slugs.length}`);
  assert.equal(new Set(slugs).size, slugs.length, "two guides share a slug");
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, slug);
});

test("every cited source is an official https .gov page", () => {
  assert.ok(urls.length > 0, "no sources found; the reader of this test has stopped matching");
  for (const url of urls) assert.match(url, /^https:\/\/([a-z0-9-]+\.)*[a-z0-9-]+\.gov\//, url);
});

test("a related guide always points at a guide that exists", () => {
  for (const block of source.matchAll(/related: \[([^\]]*)\]/g)) {
    for (const slug of [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])) {
      assert.ok(slugs.includes(slug), `related guide "${slug}" does not exist`);
    }
  }
});

test("a dollar amount appears only in a step that cites its source", () => {
  // Steps are the only place a reader acts on a number; FAQs point to sources.
  for (const step of source.matchAll(/\{\s*heading: "([^"]+)",\s*body: \[([\s\S]*?)\],\s*(source: \w+,\s*)?\}/g)) {
    if (/\$\d/.test(step[2])) assert.ok(step[3], `"${step[1]}" states an amount without a source`);
  }
});

test("search titles and descriptions fit what Google shows", () => {
  for (const match of source.matchAll(/metaTitle: "([^"]+)"/g)) assert.ok(match[1].length <= 60, match[1]);
  for (const match of source.matchAll(/metaDescription: "([^"]+)"/g)) assert.ok(match[1].length <= 160, match[1]);
});

test("the guides are in the sitemap and the private areas are not crawled", () => {
  assert.match(read("app/sitemap.ts"), /guides\.map/);
  const robots = read("app/robots.ts");
  for (const path of ["/app", "/auth", "/api"]) assert.ok(robots.includes(`"${path}"`), `${path} is not disallowed`);
  assert.doesNotMatch(robots, /"\/share"/, "shared links must stay fetchable for link previews");
});

test("the plan button pre-fills a new Mission the same way a template does", () => {
  assert.match(source, /return `\/app\/missions\/new\?\$\{params\.toString\(\)\}`;/);
  for (const field of ["name", "intent", "criteria", "actions"]) assert.ok(source.includes(`${field}: guide.mission.${field}`), field);
});

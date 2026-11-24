import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

// The public guides are written to be found in search and acted on, in six
// languages. A wrong fee, a dead official link, or a translation that has
// drifted from the English (a step missing, a source dropped) does more harm
// than no page. The rules from the header of lib/guides.ts are checked here.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const LANGUAGES = ["en", "es", "ar", "fr", "de", "nb"];

/** The shape of each guide in a language file, read from its source text. */
function parse(lang) {
  const body = read(`lib/guides/${lang}.ts`);
  const blocks = body.split(/\n {4}\{\n {6}slug: /).slice(1);
  return blocks.map((block) => {
    const string = (key) => new RegExp(`^ {6}${key}: "((?:[^"\\\\]|\\\\.)*)",$`, "m").exec(block)?.[1];
    const steps = [...block.matchAll(/\{ heading: "((?:[^"\\]|\\.)*)", body: \[(.*?)\](?:, source: "(\w+)")? \}/g)]
      .map((match) => ({ heading: match[1], body: match[2], source: match[3] ?? null }));
    const list = (key) => [...(new RegExp(`^ {6}${key}: \\[([^\\]]*)\\]`, "m").exec(block)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    return {
      slug: /^"([^"]+)"/.exec(block)[1],
      country: string("country"),
      metaTitle: string("metaTitle"),
      metaDescription: string("metaDescription"),
      steps,
      faqs: [...block.matchAll(/\{ question: "/g)].length,
      sources: list("sources"),
      related: list("related"),
    };
  });
}

const parsed = Object.fromEntries(LANGUAGES.map((lang) => [lang, parse(lang)]));
const english = parsed.en;

test("there are guides, each with a unique, URL-safe slug", () => {
  assert.ok(english.length >= 5, `expected at least five guides, found ${english.length}`);
  const slugs = english.map((guide) => guide.slug);
  assert.equal(new Set(slugs).size, slugs.length, "two guides share a slug");
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, slug);
  for (const guide of english) assert.ok(guide.steps.length >= 5, `${guide.slug}: the step reader has stopped matching`);
});

test("every language carries the same guides, steps, questions and sources as English", () => {
  for (const lang of LANGUAGES.slice(1)) {
    assert.deepEqual(parsed[lang].map((g) => g.slug), english.map((g) => g.slug), `${lang}: guides differ`);
    parsed[lang].forEach((guide, index) => {
      const source = english[index];
      assert.deepEqual(guide.steps.map((s) => s.source), source.steps.map((s) => s.source), `${lang}/${guide.slug}: steps or their sources differ`);
      assert.equal(guide.faqs, source.faqs, `${lang}/${guide.slug}: question count differs`);
      assert.deepEqual(guide.sources, source.sources, `${lang}/${guide.slug}: sources differ`);
      assert.deepEqual(guide.related, source.related, `${lang}/${guide.slug}: related guides differ`);
    });
  }
});

test("Arabic reads right to left and no other language does", () => {
  for (const lang of LANGUAGES) {
    assert.match(read(`lib/guides/${lang}.ts`), new RegExp(`dir: "${lang === "ar" ? "rtl" : "ltr"}"`), lang);
  }
});

test("every cited source is an official https page: US .gov or a listed official host", () => {
  const text = read("lib/guides/sources.ts");
  const urls = [...text.matchAll(/: "(https?:[^"]+)"/g)].map((match) => match[1]);
  const hosts = [...(/OFFICIAL_HOSTS = \[([\s\S]*?)\]/.exec(text)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(urls.length > 0, "no sources found; the reader of this test has stopped matching");
  assert.ok(hosts.length > 0, "no official hosts found");
  // Germany's federal and statutory bodies, and the UK's GOV.UK and NHS.
  for (const host of hosts) assert.match(host, /^((www\.)?(gesetze-im-internet\.de|make-it-in-germany\.com|bafin\.de|bamf\.de|rundfunkbeitrag\.de)|[a-z]+\.bund\.de|www\.gov\.uk|www\.nhs\.uk)$/, host);
  for (const url of urls) {
    const { protocol, hostname } = new URL(url);
    assert.equal(protocol, "https:", url);
    assert.ok(/\.gov$/.test(hostname) || hosts.includes(hostname), `${url} is not an official source`);
  }
});

test("a related guide always points at a guide that exists", () => {
  const slugs = english.map((guide) => guide.slug);
  for (const guide of english) for (const slug of guide.related) assert.ok(slugs.includes(slug), `related guide "${slug}" does not exist`);
});

test("a dollar, euro or pound amount appears only in a step that cites its source", () => {
  for (const lang of LANGUAGES) {
    for (const guide of parsed[lang]) {
      for (const step of guide.steps) {
        if (/\$\s?\d|\d\s?\$|€\s?\d|\d\s?€|£\s?\d|\d\s?£|\d\s?(euro|euros|Euro|يورو|pounds?|Pfund|pund|libras|livres|جنيه[اً]*)/.test(step.body)) assert.ok(step.source, `${lang}/${guide.slug}: "${step.heading}" states an amount without a source`);
      }
    }
  }
});

test("every guide names its country, and each country has its notice in every language", () => {
  for (const lang of LANGUAGES) {
    const body = read(`lib/guides/${lang}.ts`);
    const guides = body.split(/\n {4}\{\n {6}slug: /).slice(1);
    for (const block of guides) assert.match(block, /^ {6}country: "(us|de|uk)",$/m, `${lang}: a guide has no country`);
    for (const field of ["countryNotice", "countryHeading", "disclaimer"]) {
      assert.match(body, new RegExp(`${field}: \\{\\n {6}us: "[^"]+",\\n {6}de: "[^"]+",\\n {6}uk: "[^"]+",`), `${lang}: ${field} is not set for every country`);
    }
  }
  const component = read("components/guide-article.tsx");
  assert.match(component, /chrome\.countryNotice\[guide\.country\]/);
  assert.match(component, /chrome\.disclaimer\[guide\.country\]/);
  assert.doesNotMatch(component, /usNotice/);
});

test("the Germany guide covers the first-month essentials, each with its official source", () => {
  const germany = english.find((guide) => guide.slug === "moving-to-germany-checklist");
  assert.ok(germany, "the Germany guide is missing");
  const sources = germany.steps.map((step) => step.source).filter(Boolean);
  for (const key of ["deRegistration", "deResidence", "deHealth", "deBank", "deTaxId", "deBroadcast", "deIntegration", "deDriving"]) {
    assert.ok(sources.includes(key), `no step cites ${key}`);
  }
  assert.ok(germany.sources.includes("deFines"), "the fine in the FAQ needs its source in the list");
});

test("the UK guide covers the first-month essentials, each with its official source", () => {
  const uk = english.find((guide) => guide.slug === "moving-to-the-uk-checklist");
  assert.ok(uk, "the UK guide is missing");
  assert.equal(uk.country, "uk");
  const sources = uk.steps.map((step) => step.source).filter(Boolean);
  for (const key of ["ukEvisa", "ukRent", "ukCouncilTax", "ukGp", "ukNino", "ukBank", "ukTaxCode", "ukTvLicence", "ukDriving"]) {
    assert.ok(sources.includes(key), `no step cites ${key}`);
  }
  // Facts that are England-only must say so, in every language.
  for (const lang of LANGUAGES) {
    const guide = parsed[lang].find((item) => item.slug === "moving-to-the-uk-checklist");
    const rent = guide.steps.find((step) => step.source === "ukRent");
    const gp = guide.steps.find((step) => step.source === "ukGp");
    const england = { en: "England", ar: "إنجلترا", es: "Inglaterra", fr: "Angleterre", de: "England", nb: "England" }[lang];
    assert.ok(rent.heading.includes(england) && gp.body.includes(england), `${lang}: right to rent and GP registration are said to be for England`);
  }
});

test("search titles and descriptions fit what Google shows", () => {
  for (const lang of LANGUAGES) {
    for (const guide of parsed[lang]) {
      assert.ok(guide.metaTitle && guide.metaTitle.length <= 60, `${lang}/${guide.slug} title: ${guide.metaTitle?.length}`);
      assert.ok(guide.metaDescription && guide.metaDescription.length <= 160, `${lang}/${guide.slug} description: ${guide.metaDescription?.length}`);
    }
  }
});

test("every language is in the sitemap and the private areas are not crawled", () => {
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /GUIDE_LANGUAGES\.flatMap/);
  assert.match(sitemap, /guideAlternates/);
  assert.match(read("lib/guides.ts"), /export const GUIDE_LANGUAGES = \["en", "es", "ar", "fr", "de", "nb"\] as const;/);
  const robots = read("app/robots.ts");
  for (const path of ["/app", "/auth", "/api"]) assert.ok(robots.includes(`"${path}"`), `${path} is not disallowed`);
  assert.doesNotMatch(robots, /"\/share"/, "shared links must stay fetchable for link previews");
});

test("the plan button pre-fills a new Mission the same way a template does", () => {
  const source = read("lib/guides.ts");
  assert.match(source, /return `\/app\/missions\/new\?\$\{params\.toString\(\)\}`;/);
  for (const field of ["name", "intent"]) assert.ok(source.includes(`${field}: guide.mission.${field}`), field);
  for (const field of ["criteria", "actions"]) assert.ok(source.includes(`${field}: guide.mission.${field}.join("\\n")`), field);
});

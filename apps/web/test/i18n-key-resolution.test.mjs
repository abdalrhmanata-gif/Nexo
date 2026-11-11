import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { LANGUAGES, readDictionaries, unescapeLiteral } from "./helpers/dictionaries.mjs";

// The root cause behind every untranslated string reported so far.
//
// translate() returns the English source when a key is absent:
//
//   DICTIONARIES[language][en] ?? en
//
// So `t("opportunity")` compiles, runs, renders — and shows English to an
// Arabic reader, with nothing anywhere reporting a problem. Every audit
// before this one asked "is this string wrapped?" and the answer was yes.
// None asked "does the wrapper resolve?"
//
// This test asks the second question. For every call site it works out which
// languages actually fall back to English, which is the thing a reader sees.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");


function sourceFiles() {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  return ["app", "components", "lib"]
    .flatMap((dir) => walk(join(webRoot, dir)))
    // .mjs too: lib/mission-content.mjs and lib/mission-intelligence.mjs write
    // the sentences of the mission page, and were invisible to this audit
    // while they were not.
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts") || file.endsWith(".mjs"));
}

/**
 * Every argument list passed to t(…) or translate(…), balanced on parentheses
 * so a nested call or a ternary is captured whole. A plain regex for
 * `t("…")` misses `t(count === 1 ? "opportunity" : "opportunities")`, which
 * is exactly the call that shipped the bug this test was written for.
 */
function translatorCallArguments(body) {
  const spans = [];
  for (const match of body.matchAll(/(?<![A-Za-z0-9_$])(?:t|translate)\(/g)) {
    let index = match.index + match[0].length;
    const start = index;
    let depth = 1;
    while (index < body.length && depth > 0) {
      const ch = body[index];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      else if (ch === '"') {
        index += 1;
        while (index < body.length && body[index] !== '"') index += body[index] === "\\" ? 2 : 1;
      }
      index += 1;
    }
    spans.push({ start, text: body.slice(start, index - 1) });
  }
  return spans;
}

const lineOf = (body, offset) => body.slice(0, offset).split("\n").length;

/** Every place a key is looked up, with the languages that fall back to English. */
export function unresolvedCallSites(tables = readDictionaries(), files = sourceFiles()) {
  const found = [];
  for (const file of files) {
    const body = readFileSync(file, "utf8");
    const where = (offset) => `${relative(webRoot, file)}:${lineOf(body, offset)}`;

    // t() and translate() can only be served by the dictionary.
    for (const span of translatorCallArguments(body)) {
      for (const literal of span.text.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
        const key = unescapeLiteral(literal[1]);
        if (!key) continue;
        const missing = LANGUAGES.filter((name) => !tables[name].has(key));
        if (missing.length) found.push({ at: where(span.start), key, missing });
      }
    }

    // <LocalizedText> may still carry inline nb/ar, which override the table
    // for those two languages only — never for es, fr or de.
    for (const tag of body.matchAll(/<LocalizedText\b([^>]*?)\/?>/gs)) {
      const attributes = tag[1];
      const en = /\ben="((?:[^"\\]|\\.)*)"/.exec(attributes);
      if (!en) continue;
      const key = unescapeLiteral(en[1]);
      const inline = { NB: /\bnb\s*=/.test(attributes), AR: /\bar\s*=/.test(attributes) };
      const missing = LANGUAGES.filter((name) => !tables[name].has(key) && !inline[name]);
      if (missing.length) found.push({ at: where(tag.index), key, missing });
    }
  }
  return found;
}

test("the audit has sources and five dictionaries to work with", () => {
  const tables = readDictionaries();
  assert.equal(Object.keys(tables).length, 5);
  for (const name of LANGUAGES) {
    assert.ok(tables[name].size > 100, `dictionary ${name} holds only ${tables[name].size} keys`);
  }
  assert.ok(sourceFiles().length > 20, "expected the app, component and lib sources");
});

test("every translation key used in the code resolves in all five languages", () => {
  const unresolved = unresolvedCallSites();
  const report = unresolved.map((f) => `${f.at}  "${f.key}" falls back to English in ${f.missing.join(", ")}`);
  assert.deepEqual(report, [],
    "these call sites are wrapped for translation but the key is absent, so the reader sees English");
});

test("no call site relies on inline nb/ar instead of the dictionary", () => {
  // The inline props are a second source of truth that covers two of the five
  // languages. A key written only inline works in Norwegian and Arabic and is
  // silently English in Spanish, French and German — which is how the nav bar
  // came to be half-translated. The dictionary is the only path now.
  const offenders = [];
  for (const file of sourceFiles()) {
    const body = readFileSync(file, "utf8");
    for (const tag of body.matchAll(/<LocalizedText\b([^>]*?)\/?>/gs)) {
      // Any form of the prop, not only nb="…". Three call sites wrote
      // nb={`${n} oppdrag …`} and a check for the quoted form walked past
      // all three while reporting the app clean.
      if (/\bnb\s*=|\bar\s*=/.test(tag[1])) {
        offenders.push(`${relative(webRoot, file)}:${lineOf(body, tag.index)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "move these inline translations into lib/i18n.ts");
});

test("the mission draft is generated in the reader's language", () => {
  // The owner wrote an opportunity in Norwegian and the draft came back in
  // English: the name, the intent, the success criteria and the first steps.
  // This draft is not a label — the person edits it and saves it as their own
  // mission — so it has to be written in their language at the moment it is
  // built. Every string literal inside missionHref must go through t().
  const body = readFileSync(join(webRoot, "components/opportunity-intelligence.tsx"), "utf8");
  const start = body.indexOf("function missionHref(");
  assert.ok(start > -1, "missionHref has been renamed; update this test");
  const span = body.slice(start, body.indexOf("\n}", start));

  const bare = [];
  for (const literal of span.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const text = literal[1];
    // Keys and flags carry no prose; the reader never sees them.
    if (!/[A-Za-z]{4}/.test(text) || !/\s/.test(text)) continue;
    const before = span.slice(Math.max(0, literal.index - 3), literal.index);
    if (!before.endsWith("t(")) bare.push(text);
  }
  assert.deepEqual(bare, [], "these go into the draft untranslated");

  // And the translator has to reach it, which it cannot do from a hook.
  assert.match(span, /function missionHref\(opportunity: Opportunity, t: \(en: string\) => string\)/);
  assert.match(body, /missionHref\(opportunity, t\)/);
});

test("the audit would still catch the shapes it was written for", () => {
  // A guard that cannot fail is decoration. Run the real logic against a
  // dictionary with a hole in it and check it reports each shape.
  const tables = Object.fromEntries(LANGUAGES.map((n) => [n, new Map([["kept", "beholdt"]])]));
  const dir = mkdtempSync(join(tmpdir(), "i18n-guard-"));
  const probe = join(dir, "probe.tsx");
  writeFileSync(probe, [
    'const a = t("kept");',                                   // resolves — must stay silent
    'const b = t(n === 1 ? "opportunity" : "opportunities");', // the ternary shape
    '<LocalizedText en="Pricing" nb="Priser" ar="الأسعار" />', // inline: es/fr/de only
    '<LocalizedText en="Workspace" />',                        // bare: all five
  ].join("\n"));
  const found = unresolvedCallSites(tables, [probe]);
  const byKey = Object.fromEntries(found.map((f) => [f.key, f.missing.join(",")]));
  assert.equal(byKey["kept"], undefined, "a resolvable key must not be reported");
  assert.equal(byKey["opportunity"], "NB,AR,ES,FR,DE");
  assert.equal(byKey["opportunities"], "NB,AR,ES,FR,DE", "the ternary branch must be read too");
  assert.equal(byKey["Pricing"], "ES,FR,DE", "inline nb/ar cover only those two languages");
  assert.equal(byKey["Workspace"], "NB,AR,ES,FR,DE");
});

test("no dictionary carries a sentence the application no longer says", () => {
  // The opposite drift to a missing key. A sentence that is removed from a
  // page leaves five translations behind; twenty-two had gathered, including
  // the promises of features that were taken off the site.
  const source = sourceFiles().filter((file) => !file.endsWith("lib/i18n.ts"))
    .map((file) => readFileSync(file, "utf8")).join("\n")
    .replace(/\\(["'\\])/g, "$1").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const tables = readDictionaries();
  const raw = sourceFiles().filter((file) => !file.endsWith("lib/i18n.ts")).map((file) => readFileSync(file, "utf8")).join("\n");
  // A key holding a line break is written "\\n" in source; look for it both ways.
  const said = (text) => source.includes(text) || raw.includes(JSON.stringify(text).slice(1, -1));
  const stale = [...tables.NB.keys()].filter((key) => !said(key.includes("|") ? key.split("|")[0] : key));
  assert.ok(tables.NB.size > 500, "the dictionary reader has stopped matching");
  assert.deepEqual(stale, [], "remove these from all five dictionaries, or use them");
});

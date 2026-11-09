import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { LANGUAGES, readDictionaries } from "./helpers/dictionaries.mjs";

// Keys that never appear inside t("…").
//
// test/i18n-key-resolution.test.mjs reads the literal inside each call. It
// cannot see t(STANCE_LABELS[item.stance]) or t(priorityDescription(priority)),
// because at that point the key is a variable. Those strings are written
// somewhere else entirely — a lookup table, a plain module, an API route —
// and nothing connected them to the dictionary.
//
// This test follows each of those three paths to its literals by name. Naming
// them is deliberate: a guard that tried to infer every indirect key would
// either miss some or invent some, and a wrong number here is worse than a
// short one. When a fourth path appears, it gets added here.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(webRoot, file), "utf8");


/** The values of every `const SOMETHING_LABELS: Record<…> = { … }` table. */
export function labelTableValues(body) {
  const values = [];
  for (const table of body.matchAll(/const\s+\w*LABELS\w*\s*:[^=]*=\s*\{([\s\S]*?)\n\};/g)) {
    for (const entry of table[1].matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)) values.push(entry[1]);
  }
  return values;
}

/** Every message the analyze route can hand back to the browser. */
export function apiMessages(body) {
  const out = [...body.matchAll(/jsonError\(\s*\d+\s*,\s*"[A-Z_]+"\s*,\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  for (const m of body.matchAll(/\berror:\s*"((?:[^"\\]|\\.)*)"/g)) out.push(m[1]);
  return out;
}

/**
 * Every sentence priorityDescription can return — and only that function.
 * Its neighbour opportunityPriority returns "HIGH_SCORE" and friends, which
 * are enum values the reader never sees; a wider sweep demanded Norwegian
 * for them.
 */
export function verdictSentences(body) {
  const start = body.indexOf("export function priorityDescription");
  if (start === -1) return [];
  const next = body.indexOf("\nexport function", start + 1);
  const span = body.slice(start, next === -1 ? body.length : next);
  return [...span.matchAll(/return\s+"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

const SOURCES = [
  {
    what: "evidence stance and source-type labels",
    keys: () => [
      ...labelTableValues(read("components/opportunity-evidence-panel.tsx")),
      ...labelTableValues(read("components/opportunity-intelligence.tsx")),
    ],
    least: 9,
  },
  {
    what: "messages the AI brief API can return",
    keys: () => apiMessages(read("app/api/opportunities/analyze/route.ts")),
    least: 20,
  },
  {
    what: "verdicts from lib/opportunity-intelligence.mjs",
    keys: () => verdictSentences(read("lib/opportunity-intelligence.mjs")),
    least: 3,
  },
];

for (const source of SOURCES) {
  test(`${source.what} are present in every dictionary`, () => {
    const keys = [...new Set(source.keys())];
    // If an extractor stops matching — a helper is renamed, a table reshaped —
    // it would find nothing and this test would pass while guarding nothing.
    assert.ok(keys.length >= source.least,
      `expected at least ${source.least} strings for ${source.what}, found ${keys.length}; the extractor has probably stopped matching`);
    const tables = readDictionaries();
    const missing = [];
    for (const key of keys) {
      const absent = LANGUAGES.filter((name) => !tables[name].has(key));
      if (absent.length) missing.push(`"${key}" is missing from ${absent.join(", ")}`);
    }
    assert.deepEqual(missing, [], `these reach the reader through t(variable), so a missing key shows English`);
  });
}

test("the extractors read the shapes they claim to", () => {
  // Each is run against a small sample, so a silent regex change is caught
  // here rather than by a guard that quietly matches nothing.
  assert.deepEqual(
    labelTableValues('const STANCE_LABELS: Record<X, string> = {\n  supports: "Supports the thesis",\n  context: "Context only",\n};'),
    ["Supports the thesis", "Context only"],
  );
  assert.deepEqual(
    apiMessages('return jsonError(503, "AI_USAGE_UNAVAILABLE", "Usage could not be verified.");'),
    ["Usage could not be verified."],
  );
  assert.deepEqual(
    verdictSentences(
      'export function opportunityPriority(score) {\n  return "HIGH_SCORE";\n}\n' +
      'export function priorityDescription(priority) {\n  case "VALIDATE":\n      return "Potentially worthwhile.";\n}\n',
    ),
    ["Potentially worthwhile."],
    "the neighbouring enum returns must stay out of it",
  );
});

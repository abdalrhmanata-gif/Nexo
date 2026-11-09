import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { readDictionaries } from "./helpers/dictionaries.mjs";

// The audits that came before this one looked for <LocalizedText en="…">,
// t("…"), and HTML attributes. All three missed the same shape twice:
//
//   const pillars = [{ title: "Decide with evidence", description: "…" }];
//   …
//   <h3>{item.title}</h3>
//
//   <RatingField label="Strategic fit" help="How well does it match…" />
//
// Neither is a text node and neither is an HTML attribute, so both rendered
// in English on an Arabic page while every audit reported full coverage.
//
// This test reads the strings where they are *written* rather than where they
// are rendered: prose sitting in an object property, or passed to a custom
// component through a prop that carries prose. Each must be a dictionary key.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Property and prop names that carry prose a person reads. */
const PROSE_KEYS = "title|description|label|help|hint|summary|caption|heading|blurb|message|note";

/**
 * The `export const metadata` block is the browser tab title and the search
 * description, not page content. The two legal pages set theirs in English
 * deliberately and say so in their own text. Translating page metadata is a
 * separate job — it needs generateMetadata(), which reads the language on the
 * server — so this audit stays out of that block rather than reporting it as
 * a bug every run.
 */
function withoutMetadata(body) {
  const start = body.indexOf("export const metadata");
  if (start === -1) return body;
  let depth = 0;
  let index = body.indexOf("{", start);
  if (index === -1) return body;
  const open = index;
  do {
    if (body[index] === "{") depth += 1;
    else if (body[index] === "}") depth -= 1;
    index += 1;
  } while (depth > 0 && index < body.length);
  return body.slice(0, open) + body.slice(index);
}

function sourceFiles() {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  return [...walk(join(webRoot, "app")), ...walk(join(webRoot, "components"))]
    .filter((file) => file.endsWith(".tsx"));
}


/** Prose a reader would notice: more than one word, and begins like a sentence. */
function isProse(value) {
  return /\s/.test(value) && /^[A-Z]/.test(value) && value.length >= 8 && /[a-z]{3}/.test(value);
}

// Keys are the same in every dictionary (parity is enforced separately), so
// reading one is enough. This used to parse lib/i18n.ts here, one key per
// line, and so missed every key that shares a line with another.
const keys = readDictionaries().AR;
const files = sourceFiles();

test("the audit has files and a dictionary to work with", () => {
  assert.ok(files.length > 10, `expected component sources, found ${files.length}`);
  assert.ok(keys.size > 100, `expected a populated dictionary, found ${keys.size} keys`);
});

test("prose held in an object property is translated", () => {
  const missing = [];
  for (const file of files) {
    const body = withoutMetadata(readFileSync(file, "utf8"));
    for (const match of body.matchAll(new RegExp(`^\\s*(${PROSE_KEYS}):\\s*"((?:[^"\\\\]|\\\\.)*)",?$`, "gm"))) {
      const [, property, value] = match;
      if (!isProse(value) || keys.has(value)) continue;
      missing.push(`${relative(webRoot, file)} — ${property}: "${value}"`);
    }
  }
  assert.deepEqual(missing, [],
    "these strings sit in a data structure and reach the page untranslated");
});

test("prose passed to a component through a prop is translated", () => {
  const missing = [];
  for (const file of files) {
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(new RegExp(`\\b(${PROSE_KEYS})="((?:[^"\\\\]|\\\\.)*)"`, "g"))) {
      const [, prop, value] = match;
      if (!isProse(value) || keys.has(value)) continue;
      missing.push(`${relative(webRoot, file)} — ${prop}="${value}"`);
    }
  }
  assert.deepEqual(missing, [],
    "these strings are passed to a component as a prop and reach the page untranslated");
});

test("the audit would still catch the shape it was written for", () => {
  // A guard that cannot fail is decoration. These are the two literals from
  // the report, checked against the same predicate the audit uses.
  assert.equal(isProse("Decide with evidence"), true);
  assert.equal(isProse("How well does it match the user's goal and capabilities? (25%)"), true);
  // And it should stay quiet about things that are not prose.
  assert.equal(isProse("email"), false);
  assert.equal(isProse("nav-link nav-pricing"), false);
  assert.equal(isProse("ZAVQERA"), false);
});

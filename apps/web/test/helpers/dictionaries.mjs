import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// One parser for lib/i18n.ts, because three tests had written their own and
// all three were wrong in the same way.
//
// They matched keys with /^\s*"(…)"\s*:/m — one key per line. Most of the
// file is written that way, but not all of it: several lines pack many pairs,
//
//   "MISSION CONTROL":"KONTROLLSENTER", "Search":"Søk", "New mission":"…",
//
// and every key after the first on such a line was invisible. So the audits
// read a dictionary smaller than the real one, reported keys as missing that
// were already there, and the duplicate-key test could not see a duplicate it
// was written to catch.
//
// Two things matter here: find every pair wherever it sits on the line, and
// find the end of each object without being fooled by a "{count}" placeholder
// inside a value.

export const LANGUAGES = ["NB", "AR", "ES", "FR", "DE"];

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The body of one dictionary object, ending at its real closing brace. */
function objectBody(source, name) {
  const start = source.indexOf(`const ${name}: Record<string, string> = {`);
  if (start === -1) throw new Error(`dictionary ${name} is missing from lib/i18n.ts`);
  let index = source.indexOf("{", start) + 1;
  const open = index;
  let depth = 1;
  while (depth > 0 && index < source.length) {
    const ch = source[index];
    if (ch === '"') {
      // Skip the whole literal: a value may contain { or }.
      index += 1;
      while (index < source.length && source[index] !== '"') {
        index += source[index] === "\\" ? 2 : 1;
      }
    } else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    index += 1;
  }
  return source.slice(open, index - 1);
}

/**
 * Every "key":"value" pair in order, wherever it sits on the line.
 *
 * A source literal and a dictionary key must be compared after unescaping:
 * the source holds the two characters \\ and n where the key holds a newline.
 */
export function pairsIn(body) {
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => ({ key: unescapeLiteral(m[1]), value: unescapeLiteral(m[2]) }));
}

export function unescapeLiteral(text) {
  return text.replace(/\\(.)/g, (_, ch) => (ch === "n" ? "\n" : ch === "t" ? "\t" : ch));
}

/** { NB: Map<key, value>, AR: …, … } as the application will actually see them. */
export function readDictionaries(source = readFileSync(join(webRoot, "lib/i18n.ts"), "utf8")) {
  const tables = {};
  for (const name of LANGUAGES) {
    const table = new Map();
    for (const { key, value } of pairsIn(objectBody(source, name))) table.set(key, value);
    tables[name] = table;
  }
  return tables;
}

/** Keys declared more than once, which the last declaration silently wins. */
export function duplicateKeys(source = readFileSync(join(webRoot, "lib/i18n.ts"), "utf8")) {
  const found = {};
  for (const name of LANGUAGES) {
    const seen = new Set();
    const twice = new Set();
    for (const { key } of pairsIn(objectBody(source, name))) {
      if (seen.has(key)) twice.add(key);
      seen.add(key);
    }
    found[name] = [...twice];
  }
  return found;
}

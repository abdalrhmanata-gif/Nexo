import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { readDictionaries, unescapeLiteral } from "./helpers/dictionaries.mjs";

// The simplest shape of all, and the last one left: text that was never
// wrapped for translation at all.
//
// The other audits ask whether a wrapper resolves, or whether prose sitting
// in a data structure is a key. Neither looks at
//
//   <h2>Record what you checked</h2>
//   {busy ? "Adding…" : "Add action"}
//   setError("Action update was not accepted.")
//
// which is most of a mission's detail page. Asking "is this wrapped?" turned
// out to be the wrong question anyway: a string defined in one file and
// rendered through t() in another is fine, and a string wrapped at a call
// site whose key is missing is not. So this asks the question whose answer
// the reader actually sees:
//
//   is this English sentence a key in the dictionaries?
//
// If it is, some path translates it. If it is not, it reaches the reader in
// English no matter how it is written.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Files whose English is deliberate.
 *
 * The privacy notice and the terms are published in English on purpose and
 * say so in their own text: a mistranslated liability clause would bind a
 * reader to something nobody intended.
 */
const ENGLISH_ON_PURPOSE = new Set(["app/privacy/page.tsx", "app/terms/page.tsx"]);

/** Attribute values that are machinery, not words anyone reads. */
const MACHINE_ATTRIBUTE =
  /(className|href|type|name|id|role|rel|target|aria-hidden|aria-controls|aria-labelledby|key|value|path|viewBox|autoComplete|style|xmlns|fill|stroke|d|method|action|htmlFor|scope|lang|dir|content|charSet|src|alt)\s*=\s*$/;

/**
 * `export const metadata` is the browser tab title and the search
 * description, not page content. Translating it needs generateMetadata(),
 * which reads the language on the server; that is a separate job.
 */
function withoutMetadata(body) {
  const start = body.indexOf("export const metadata");
  if (start === -1) return body;
  let index = body.indexOf("{", start);
  if (index === -1) return body;
  const open = index;
  let depth = 0;
  do {
    if (body[index] === "{") depth += 1;
    else if (body[index] === "}") depth -= 1;
    index += 1;
  } while (depth > 0 && index < body.length);
  return body.slice(0, open) + " ".repeat(index - open) + body.slice(index);
}

/**
 * Blank out comments, scanning character by character so that a `//` inside a
 * string literal is left alone. A regex for `//[^\n]*` eats the rest of the
 * line in `"Enter a valid public http:// or https:// source URL."` and turns
 * one sentence into a ragged block, which is how this guard first reported
 * two findings that were really one each.
 */
function blankComments(body) {
  const out = body.split("");
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < body.length && body[i] !== quote) i += body[i] === "\\" ? 2 : 1;
      i += 1;
    } else if (ch === "/" && body[i + 1] === "/") {
      while (i < body.length && body[i] !== "\n") out[i++] = " ";
    } else if (ch === "/" && body[i + 1] === "*") {
      const end = body.indexOf("*/", i + 2);
      const stop = end === -1 ? body.length : end + 2;
      while (i < stop) out[i++] = " ";
    } else i += 1;
  }
  return out.join("");
}

function sourceFiles() {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  return ["app", "components"]
    .flatMap((dir) => walk(join(webRoot, dir)))
    .filter((file) => file.endsWith(".tsx"))
    .filter((file) => !ENGLISH_ON_PURPOSE.has(relative(webRoot, file)));
}

/** A sentence a reader would notice: several words, beginning like prose. */
export function looksLikeSentence(text) {
  const value = text.trim();
  return value.length >= 8
    && /\s/.test(value)
    && /[a-z]{3}/.test(value)
    && /^[A-Z]/.test(value);
}

/** Every English sentence in a file that no dictionary holds. */
export function untranslatedSentences(body, keys) {
  const prepared = withoutMetadata(blankComments(body));
  const found = [];
  for (const literal of prepared.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const text = unescapeLiteral(literal[1]);
    if (!looksLikeSentence(text)) continue;
    // A CSS media query is not a sentence anyone reads.
    if (text.startsWith("(prefers-") || text.startsWith("(min-") || text.startsWith("(max-")) continue;
    if (MACHINE_ATTRIBUTE.test(prepared.slice(Math.max(0, literal.index - 50), literal.index))) continue;
    if (keys.has(text)) continue;
    found.push({ text, line: prepared.slice(0, literal.index).split("\n").length });
  }
  return found;
}

test("every English sentence in the interface is a dictionary key", () => {
  // Keys are identical across the five dictionaries — parity is enforced by
  // test/i18n-key-resolution.test.mjs — so one is enough to ask.
  const keys = readDictionaries().AR;
  const report = [];
  for (const file of sourceFiles()) {
    const body = readFileSync(file, "utf8");
    for (const hit of untranslatedSentences(body, keys)) {
      report.push(`${relative(webRoot, file)}:${hit.line}  "${hit.text.slice(0, 90)}"`);
    }
  }
  assert.deepEqual(report, [],
    "these sentences reach the reader in English whatever their language");
});

/** Attributes a reader sees. Their value is rendered exactly as written. */
// Real HTML attributes only. `label` is excluded: it is a component prop
// here, and a component is free to translate its own props — RatingField
// does exactly that.
const VISIBLE_ATTRIBUTE = /\b(title|placeholder|aria-label|alt)\s*=\s*/g;

/**
 * Prose sitting in a user-visible attribute without going through t().
 *
 * Only the attribute's own value is read. An earlier version also treated
 * every ternary branch as an attribute and reported half the application,
 * including strings that a render site wraps perfectly well.
 */
export function untranslatedAttributes(body) {
  const prepared = withoutMetadata(blankComments(body));
  const found = [];
  for (const attribute of prepared.matchAll(VISIBLE_ATTRIBUTE)) {
    let index = attribute.index + attribute[0].length;
    let value;
    if (prepared[index] === '"') {
      const close = prepared.indexOf('"', index + 1);
      value = prepared.slice(index, close + 1);
    } else if (prepared[index] === "{") {
      let depth = 1;
      let scan = index + 1;
      while (scan < prepared.length && depth > 0) {
        const ch = prepared[scan];
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        else if (ch === '"') {
          scan += 1;
          while (scan < prepared.length && prepared[scan] !== '"') scan += prepared[scan] === "\\" ? 2 : 1;
        }
        scan += 1;
      }
      value = prepared.slice(index, scan);
    } else continue;
    for (const literal of value.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const text = unescapeLiteral(literal[1]);
      if (!looksLikeSentence(text)) continue;
      // Inside t(…) the literal is a key, which is what we want.
      if (/\bt\(\s*$/.test(value.slice(0, literal.index))) continue;
      found.push({ text, line: prepared.slice(0, index).split("\n").length });
    }
  }
  return found;
}

test("prose in a user-visible attribute goes through the translator", () => {
  // "Switch to light mode" sat in a title= attribute. It is a dictionary key,
  // so the key-resolution audit saw nothing wrong and the sentence audit saw
  // a known key — yet the tooltip rendered in English, because an attribute
  // is written out as it stands and nothing wraps it later.
  const report = [];
  for (const file of sourceFiles()) {
    const body = readFileSync(file, "utf8");
    for (const hit of untranslatedAttributes(body)) {
      report.push(`${relative(webRoot, file)}:${hit.line}  "${hit.text.slice(0, 80)}"`);
    }
  }
  assert.deepEqual(report, [], "wrap these in t(): an attribute is rendered exactly as written");
});

/**
 * Blank the contents of every string and template literal, keeping length.
 * What is left between a ">" or "}" and the next "<" or "{" is either code or
 * text typed straight into JSX.
 */
function blankLiterals(body) {
  const out = body.split("");
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < body.length && body[i] !== quote) {
        if (body[i] === "\\") { out[i] = " "; i += 1; }
        if (body[i] !== "\n") out[i] = " ";
        i += 1;
      }
      i += 1;
    } else i += 1;
  }
  return out.join("");
}

/** Words that sit between a "}" and a "{" in ordinary code, not in JSX. */
const CODE_WORDS = /^(catch|finally|try|else|do|string|number|boolean|void|null|undefined|unknown|never)$/;

/**
 * Text typed directly between JSX tags or expressions.
 *
 *   <small>Currently {state}. Only states this mission can move to are listed.</small>
 *   <li>{done} complete of {total}</li>
 *   <button>Delete Mission</button>
 *
 * None of these is a string literal, so the sentence audit above — which
 * reads literals — walked past every one of them. The owner's screenshots of
 * a mission page in Arabic and in Norwegian both showed them in English.
 */
export function rawJsxText(body) {
  const prepared = blankLiterals(withoutMetadata(blankComments(body)));
  const found = [];
  for (const match of prepared.matchAll(/[>}]([^<>{}=;()]*?[A-Za-z][^<>{}=;()]*?)(?=[<{])/g)) {
    const text = match[1].trim();
    if (!/[A-Za-z]{2}/.test(text)) continue;
    if (CODE_WORDS.test(text)) continue;
    // `{ label: "English" },\n  nb: {` leaves `, nb:` between two braces once
    // the literals are blanked. That is an object key, not text.
    if (/^[,\]]/.test(text)) continue;
    // The brand is the same in every language.
    if (/^[A-Z]{3,}$/.test(text)) continue;
    // Operators and keywords mean this is code between two braces.
    if (/&&|\|\||=>|\?|\b(const|let|return|import|export|function|if|await|async|new|typeof|extends|as)\b/.test(text)) continue;
    found.push({ text, line: prepared.slice(0, match.index + 1).split("\n").length });
  }
  return found;
}

test("no text is typed straight into JSX", () => {
  const report = [];
  for (const file of sourceFiles()) {
    const body = readFileSync(file, "utf8");
    for (const hit of rawJsxText(body)) {
      report.push(`${relative(webRoot, file)}:${hit.line}  ${hit.text.slice(0, 70)}`);
    }
  }
  assert.deepEqual(report, [],
    "wrap these in <LocalizedText> or t(): text between tags reaches every reader in English");
});

test("the raw-text audit reads the shapes it claims to", () => {
  const sample = [
    'export function A({ id }: { id: string }) {',
    '  try { run(); } catch { stop(); } finally { done(); }',
    '  const label = busy ? "Saving now" : "Save it";',
    '  const LANGS = { en: { label: "English" },\n    nb: { label: "Norsk" } };',
    '  return <div>',
    '    <small>Currently {state}. Only these are listed.</small>',
    '    <li>{done} complete of {total}</li>',
    '    <button>Delete Mission</button>',
    '    <p><LocalizedText en="Already wrapped text" /></p>',
    '    <strong>ZAVQERA</strong>',
    '    {/* A comment with Words in it */}',
    '    {ready && <span>{t("Wrapped in t")}</span>}',
    '  </div>;',
    '}',
  ].join("\n");
  assert.deepEqual(rawJsxText(sample).map((hit) => hit.text), [
    "Currently",
    ". Only these are listed.",
    "complete of",
    "Delete Mission",
  ], "code keywords, literals, wrapped text, the brand and comments must stay out");
});

test("the audit reads the shapes it claims to", () => {
  // Run the real logic over a sample holding one of each shape, so a quiet
  // regex change cannot turn this guard into decoration.
  const keys = new Map([["Already translated.", "Allerede oversatt."]]);
  const sample = [
    'export const metadata: Metadata = { title: "Tab title here", description: "Search description here." };',
    'const a = <h2>Already translated.</h2>;',
    'const b = <h2>{"Record what you checked"}</h2>;',
    'const c = busy ? "Adding an action…" : "Add an action now";',
    'setError("Action update was not accepted.");',
    'const d = <div className="card opportunity-page" />;',
    'const e = window.matchMedia("(prefers-color-scheme: dark)");',
    '// A comment that says Something entirely quotable "Not a real string here".',
    'const f = check("Enter a valid public http:// or https:// source URL.");',
  ].join("\n");
  // The attribute audit reads attribute values, and only those.
  const attributeSample = [
    '<button title="Switch to light mode" />',
    '<button title={t("Switch to dark mode")} />',
    '<input placeholder={busy ? "Searching now…" : "Search your missions"} />',
    '<RatingField label="Strategic fit here" />',
    '<p>{flag ? "A plain ternary branch" : "Not an attribute at all"}</p>',
  ].join("\n");
  assert.deepEqual(untranslatedAttributes(attributeSample).map((f) => f.text).sort(), [
    "Search your missions",
    "Searching now…",
    "Switch to light mode",
  ], "a wrapped attribute, a component prop and a bare ternary must all stay out");
  const found = untranslatedSentences(sample, keys).map((f) => f.text);
  assert.deepEqual(found.sort(), [
    "Action update was not accepted.",
    "Add an action now",
    "Adding an action…",
    // Whole, not cut at the "//" inside it.
    "Enter a valid public http:// or https:// source URL.",
    "Record what you checked",
  ], "metadata, a translated key, a class name, a media query and a comment must all stay out");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  SUPPORTED_LANGUAGE_CODES,
  firstSupportedLanguage,
  languagesFromAcceptHeader,
  resolveLanguage,
  supportedLanguageFromTag,
} from "../lib/language-preference.mjs";
import { LANGUAGES } from "./helpers/dictionaries.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(webRoot, file), "utf8");

test("a browser tag is reduced to a language this product is written in", () => {
  assert.equal(supportedLanguageFromTag("nb-NO"), "nb");
  assert.equal(supportedLanguageFromTag("AR"), "ar");
  assert.equal(supportedLanguageFromTag("fr_CA"), "fr");
  assert.equal(supportedLanguageFromTag("sv-SE"), null);
  assert.equal(supportedLanguageFromTag(""), null);
  assert.equal(supportedLanguageFromTag(undefined), null);
  // A property of Object.prototype is not a language.
  assert.equal(supportedLanguageFromTag("constructor"), null);
  assert.equal(supportedLanguageFromTag("__proto__"), null);
});

test("every way a Norwegian browser names itself reaches Norwegian", () => {
  for (const tag of ["nb", "nb-NO", "no", "no-NO", "nn", "nn-NO"]) {
    assert.equal(supportedLanguageFromTag(tag), "nb", tag);
  }
});

test("the header is read in the reader's order of preference, not the order written", () => {
  assert.deepEqual(languagesFromAcceptHeader("nb-NO,nb;q=0.9,no;q=0.8,en-US;q=0.6,en;q=0.5"),
    ["nb-NO", "nb", "no", "en-US", "en"]);
  assert.deepEqual(languagesFromAcceptHeader("en;q=0.2, ar;q=0.9, de"), ["de", "ar", "en"]);
  // Equal weights keep the order they were written in.
  assert.deepEqual(languagesFromAcceptHeader("es, fr"), ["es", "fr"]);
  // q=0 means "not this one".
  assert.deepEqual(languagesFromAcceptHeader("ar;q=0, fr"), ["fr"]);
  assert.deepEqual(languagesFromAcceptHeader("*"), []);
});

test("a hostile or broken header yields nothing rather than an error", () => {
  for (const header of [null, undefined, "", ";;;", "q=1", "<script>", "a".repeat(5000), ",".repeat(5000), 42, {}]) {
    assert.deepEqual(languagesFromAcceptHeader(header), [], String(header).slice(0, 20));
  }
  // Bounded: a header of thousands of tags is not walked to the end.
  const long = Array.from({ length: 500 }, () => "sv").join(",") + ",ar";
  assert.equal(firstSupportedLanguage(languagesFromAcceptHeader(long)), null);
});

test("a choice the reader made outranks anything detected", () => {
  assert.equal(resolveLanguage({ saved: "ar", cookie: "nb", browser: ["fr"] }), "ar");
  assert.equal(resolveLanguage({ saved: null, cookie: "nb", browser: ["fr"] }), "nb");
  assert.equal(resolveLanguage({ saved: "xx", cookie: "", browser: ["fr-FR"] }), "fr");
  assert.equal(resolveLanguage({ browser: ["sv", "da", "de-AT"] }), "de",
    "the first language we are written in, not only the first in the list");
  assert.equal(resolveLanguage({ browser: ["sv"] }), "en");
  assert.equal(resolveLanguage({}), "en");
  assert.equal(resolveLanguage(), "en");
});

test("the server and the browser reach the same language for the same reader", () => {
  // The defect this module replaced: no cookie, a Norwegian browser, and a
  // page that was Norwegian where the client rendered and English where the
  // server did.
  const header = "nb-NO,nb;q=0.9,no;q=0.8,nn;q=0.7,en-US;q=0.6,en;q=0.5";
  const server = firstSupportedLanguage(languagesFromAcceptHeader(header)) ?? "en";
  const client = resolveLanguage({ browser: ["nb-NO", "nb", "no", "nn", "en-US", "en"] });
  assert.equal(server, "nb");
  assert.equal(client, server);
});

test("the language list here is the list the dictionaries are written for", () => {
  assert.deepEqual([...SUPPORTED_LANGUAGE_CODES].sort(), ["en", ...LANGUAGES.map((name) => name.toLowerCase())].sort());
  assert.match(read("lib/i18n.ts"), /SUPPORTED_LANGUAGES: AppLanguage\[\] = \["en", "nb", "ar", "es", "fr", "de"\]/);
});

test("all three readers of the language use the one rule", () => {
  const server = read("lib/i18n-server.ts");
  assert.match(server, /languagesFromAcceptHeader\(/, "the server must fall back to the browser's languages, not to English");
  assert.match(server, /firstSupportedLanguage\(/);

  const text = read("components/localized-text.tsx");
  assert.match(text, /resolveLanguage\(/);
  assert.doesNotMatch(text, /navigator\.language\.toLowerCase\(\)/, "reading only the first browser language is the rule this replaced");

  const switcher = read("components/language-switcher.tsx");
  assert.match(switcher, /resolveLanguage\(/);
  assert.doesNotMatch(switcher, /function detectLanguage/, "the switcher must not keep its own detection");
});

test("choosing a language re-renders what the server wrote", () => {
  // The switcher changed the cookie and told the client components. Whatever
  // the server had rendered — the mission page's sentences, the draft inside
  // a template link — stayed in the old language until the next full load.
  const switcher = read("components/language-switcher.tsx");
  const change = switcher.slice(switcher.indexOf("function changeLanguage"));
  assert.match(change.slice(0, change.indexOf("\n  }\n")), /router\.refresh\(\)/);
  assert.match(switcher, /useRouter\(\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// One template once reached every reader in English only: its sentences were
// never added to the dictionaries, and no check looked at template data.
test("every sentence in the mission templates is translated in every language", () => {
  const templates = read("lib/mission-templates.ts");
  const i18n = read("lib/i18n.ts");
  const sentences = [...templates.matchAll(/"((?:[^"\\]|\\.){4,})"/g)].map((m) => m[1]).filter((text) => text.includes(" "));
  assert.ok(sentences.length > 20, "the templates were read");
  for (const lang of ["NB", "AR", "ES", "FR", "DE"]) {
    const start = i18n.indexOf(`const ${lang}: Record<string, string> = {`);
    const dictionary = i18n.slice(start, i18n.indexOf("\n};", start));
    const missing = sentences.filter((text) => !dictionary.includes(`${JSON.stringify(text)}:`));
    assert.deepEqual(missing, [], `${lang} is missing template text`);
  }
});

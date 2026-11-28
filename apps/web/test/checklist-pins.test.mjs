import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { CHECKLIST_LANGUAGES, checklistChrome, checklistsIn } from "../lib/checklists.mjs";
import { checklistPinPath, checklistPinterestUrl } from "../lib/checklist-pins.mjs";

const LANGS = ["en", "ar", "es", "fr", "de", "nb"];

test("every free checklist has a pin image in public/pins", () => {
  for (const lang of LANGS) {
    for (const c of checklistsIn(lang)) {
      const path = checklistPinPath(c.slug);
      assert.equal(path, `/pins/${lang}/${c.slug}.png`);
      const file = new URL(`../public${path}`, import.meta.url);
      assert.ok(existsSync(file), `missing ${path}: run tool/pins/make_pins.py`);
      assert.ok(statSync(file).size < 400_000, `${path} is too large`);
    }
  }
});

test("the Pinterest link carries the page, the image and the title", () => {
  const url = new URL(checklistPinterestUrl("employee-onboarding-checklist"));
  assert.equal(url.origin + url.pathname, "https://www.pinterest.com/pin/create/button/");
  assert.equal(url.searchParams.get("url"), "https://zavqera.com/checklists/employee-onboarding-checklist?utm_source=pinterest&utm_medium=social");
  assert.equal(url.searchParams.get("media"), "https://zavqera.com/pins/en/employee-onboarding-checklist.png");
  assert.ok(url.searchParams.get("description"));
  assert.equal(checklistPinterestUrl("no-such-checklist"), null);
});

test("every checklist language has the Pinterest link text", () => {
  for (const lang of LANGS) assert.ok(checklistChrome(lang).pinButton, lang);
  assert.ok(CHECKLIST_LANGUAGES);
});

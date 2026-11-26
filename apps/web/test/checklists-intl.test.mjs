import assert from "node:assert/strict";
import test from "node:test";
import { CHECKLIST_GROUPS, CHECKLIST_LANGUAGES, checklistAlternates, checklistBySlug, checklistChrome, checklistMission, checklistPath, checklists, checklistsIn } from "../lib/checklists.mjs";
import { CHECKLIST_SLUGS, CHECKLIST_SLUGS_BY_LANG, COUNTED_ROUTES } from "../lib/metrics-routes.mjs";
import { checklistPdfModel } from "../lib/checklist-pdf.mjs";

// Checklists written in every language ZAVQERA speaks. The English rules
// (test/checklists.test.mjs) and the Arabic ones (test/checklists-ar.test.mjs)
// hold for each; these are the rules every language shares.

const OTHERS = CHECKLIST_LANGUAGES.filter((lang) => lang !== "en");
/** A deadline in days, in any of the languages: never stated without a source. */
const DAYS = /\d+\s*(days?|días?|jours?|Tage?n?|dager?|dag|يوم|أيام|يومًا)\b/i;

test("every language has its checklists, with unique slugs, served under its own address", () => {
  const all = CHECKLIST_LANGUAGES.flatMap((lang) => checklistsIn(lang).map((item) => item.slug));
  assert.equal(new Set(all).size, all.length, "a slug is used twice");
  for (const lang of OTHERS) {
    const list = checklistsIn(lang);
    assert.ok(list.length >= 3, `${lang}: ${list.length} checklists`);
    assert.deepEqual(list.map((item) => item.slug).sort(), [...CHECKLIST_SLUGS_BY_LANG[lang]].sort(), `${lang}: analytics list`);
    for (const item of list) {
      assert.equal(item.lang, lang);
      assert.equal(checklistPath(item.slug), `/${lang}/checklists/${item.slug}`);
      assert.ok(COUNTED_ROUTES.includes(`/${lang}/checklists/${item.slug}`), item.slug);
      assert.ok(CHECKLIST_GROUPS.includes(item.group), item.slug);
      for (const related of item.related) assert.equal(checklistBySlug(related)?.lang, lang, `${item.slug} links to ${related}`);
    }
    assert.equal(checklistPath(undefined, lang), `/${lang}/checklists`);
    assert.equal(checklistChrome(lang).groupHeading.operations.length > 0, true);
  }
  assert.deepEqual(checklists.map((item) => item.slug).sort(), [...CHECKLIST_SLUGS].sort(), "English analytics list");
});

test("each new subject exists in all six languages, and they name each other", () => {
  for (const english of ["restaurant-opening-closing-checklist", "kitchen-cleaning-schedule", "short-stay-turnover-cleaning-checklist"]) {
    const alternates = checklistAlternates(checklistBySlug(english));
    assert.deepEqual(Object.keys(alternates).sort(), [...CHECKLIST_LANGUAGES].sort(), english);
    for (const [lang, path] of Object.entries(alternates)) {
      const slug = path.split("/").pop();
      assert.deepEqual(checklistAlternates(checklistBySlug(slug)), alternates, `${lang} names the same set`);
    }
  }
});

test("every checklist in every language follows the same shape", () => {
  for (const lang of CHECKLIST_LANGUAGES) {
    for (const item of checklistsIn(lang)) {
      const name = `${lang}/${item.slug}`;
      assert.ok(item.metaTitle.length <= 60, `${name}: title ${item.metaTitle.length}`);
      assert.ok(item.metaDescription.length >= 90 && item.metaDescription.length <= 160, `${name}: description ${item.metaDescription.length}`);
      assert.ok(item.steps.length >= 6, `${name}: steps`);
      assert.ok(item.faqs.length >= 3, `${name}: questions`);
      assert.ok(item.intro.length >= 2, `${name}: intro`);
      for (const step of item.steps) {
        assert.ok(step.proof.length > 10, `${name} / ${step.heading}: proof`);
        if (!step.source) assert.doesNotMatch(step.detail, DAYS, `${name} / ${step.heading}: a deadline without a source`);
      }
      const mission = checklistMission(item);
      assert.deepEqual(mission.actions, item.steps.map((step) => step.heading));
      assert.ok(mission.criteria.length >= 2 && mission.criteria.length <= 5, `${name}: criteria`);
      assert.ok(checklistPdfModel(item.slug), `${name}: PDF`);
    }
  }
});

test("the pages' frame is complete in every language, PDF words included", () => {
  const english = checklistChrome("en");
  for (const lang of OTHERS) {
    const chrome = checklistChrome(lang);
    for (const key of Object.keys(english)) assert.ok(key in chrome, `${lang}: ${key}`);
    for (const group of CHECKLIST_GROUPS) assert.ok(chrome.groupHeading[group], `${lang}: group ${group}`);
    assert.ok(chrome.pdfWriteIn.includes("____"), `${lang}: write-in line`);
    assert.match(chrome.pdfFooter, /zavqera\.com/);
  }
});

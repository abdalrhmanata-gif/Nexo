import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { CHECKLIST_CHROME, CHECKLIST_GROUPS, checklistAlternates, checklistBySlug, checklistChrome, checklistMission, checklistPath, checklists } from "../lib/checklists.mjs";
import { CHECKLIST_CHROME_AR, checklistsAr } from "../lib/checklists-ar.mjs";
import { CHECKLIST_SLUGS_AR, COUNTED_ROUTES, normaliseRoute } from "../lib/metrics-routes.mjs";
import { TASK_TRACKER_AR, taskTrackerPath } from "../lib/task-tracker.mjs";
import { PLAN_LIMITS } from "../lib/billing-plans.mjs";
import { buildLlmsTxt } from "../lib/llms-txt.mjs";

// The Arabic checklists and the Arabic task-tracker page: written for every
// Arab country, in Arabic, under the same rules as the English checklists.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const ARABIC = /[؀-ۿ]/;

/** Arab countries: a page that names one is no longer for all of them. */
const COUNTRIES = /السعودية|المملكة|الإمارات|مصر|الكويت|قطر|البحرين|عُمان|سلطنة|الأردن|المغرب|الجزائر|تونس|العراق|لبنان/;

test("Arabic slugs are unique across both languages and served under /ar", () => {
  const all = [...checklists, ...checklistsAr].map((item) => item.slug);
  assert.equal(new Set(all).size, all.length, "a slug is used in two languages");
  for (const item of checklistsAr) {
    assert.equal(item.lang, "ar");
    assert.match(item.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, item.slug);
    assert.ok(CHECKLIST_GROUPS.includes(item.group), `${item.slug}: group`);
    assert.equal(checklistPath(item.slug), `/ar/checklists/${item.slug}`);
    assert.equal(checklistBySlug(item.slug), item);
    for (const related of item.related) {
      assert.equal(checklistBySlug(related)?.lang, "ar", `${item.slug} links to ${related}, which is not an Arabic checklist`);
    }
  }
  assert.equal(checklistPath(undefined, "ar"), "/ar/checklists");
  assert.equal(checklistPath("employee-offboarding-checklist"), "/checklists/employee-offboarding-checklist");
  assert.equal(checklistChrome("ar"), CHECKLIST_CHROME_AR);
  assert.equal(checklistChrome(), CHECKLIST_CHROME);
});

test("an Arabic checklist's English counterpart exists, and both name each other", () => {
  for (const item of checklistsAr) {
    assert.ok(item.en, `${item.slug}: no English counterpart named`);
    const english = checklistBySlug(item.en);
    assert.ok(english && !english.lang, `${item.slug}: ${item.en} is not an English checklist`);
    const expected = { en: checklistPath(item.en), ar: checklistPath(item.slug) };
    assert.deepEqual(checklistAlternates(item), expected);
    assert.deepEqual(checklistAlternates(english), expected);
  }
  // An English checklist with no Arabic counterpart has no alternates.
  assert.equal(checklistAlternates(checklistBySlug("month-end-close-checklist")), null);
});

test("the Arabic pages are written in Arabic, for every Arab country", () => {
  const texts = [];
  for (const item of checklistsAr) {
    texts.push(item.title, item.short, item.metaTitle, item.metaDescription, item.audience, item.when, item.intent, ...item.intro, ...item.criteria);
    for (const step of item.steps) texts.push(step.heading, step.detail, step.proof);
    for (const faq of item.faqs) texts.push(faq.question, faq.answer);
  }
  for (const [key, value] of Object.entries(CHECKLIST_CHROME_AR)) {
    if (typeof value === "string" && key !== "dir") texts.push(value);
  }
  texts.push(...Object.values(CHECKLIST_CHROME_AR.groupHeading), ...CHECKLIST_CHROME_AR.why);
  const tracker = TASK_TRACKER_AR;
  texts.push(tracker.metaTitle, tracker.metaDescription, tracker.title, tracker.lead, tracker.paidNote, ...tracker.free, ...tracker.forWho);
  for (const item of [...tracker.problems, ...tracker.how]) texts.push(item.heading, item.detail);
  for (const faq of tracker.faqs) texts.push(faq.question, faq.answer);
  for (const text of texts) {
    assert.match(text, ARABIC, `not Arabic: ${text}`);
    assert.doesNotMatch(text, COUNTRIES, `names a country: ${text}`);
  }
  assert.equal(CHECKLIST_CHROME_AR.dir, "rtl");
  assert.equal(CHECKLIST_CHROME_AR.stepsCount(11), "11 خطوة");
  assert.equal(CHECKLIST_CHROME_AR.stepsCount(7), "7 خطوات");
});

test("Arabic search titles and descriptions fit in a result", () => {
  const pages = [...checklistsAr, CHECKLIST_CHROME_AR, TASK_TRACKER_AR].map((item) => ({
    name: item.slug ?? item.title ?? item.indexTitle,
    title: item.metaTitle ?? item.indexMetaTitle,
    description: item.metaDescription ?? item.indexMetaDescription,
  }));
  for (const page of pages) {
    assert.ok(page.title.length <= 60, `${page.name}: title is ${page.title.length} characters`);
    assert.ok(page.description.length <= 160, `${page.name}: description is ${page.description.length} characters`);
    assert.ok(page.description.length >= 90, `${page.name}: description too short to be useful`);
  }
});

test("every Arabic step names the proof to keep, and no step states a country's law as fact", () => {
  for (const item of checklistsAr) {
    assert.ok(item.steps.length >= 6, `${item.slug}: fewer than 6 steps`);
    assert.ok(item.faqs.length >= 3, `${item.slug}: fewer than 3 questions`);
    assert.ok(item.intro.length >= 2, `${item.slug}: intro`);
    for (const step of item.steps) {
      assert.ok(step.proof && step.proof.length > 10, `${item.slug} / ${step.heading}: no proof named`);
      assert.ok(step.heading.length <= 120, `${item.slug} / ${step.heading}: heading too long`);
      // A deadline in days differs by country; without a source it is not stated.
      if (!step.source) assert.doesNotMatch(step.detail, /\d+\s*(يوم|أيام|يومًا)/, `${item.slug} / ${step.heading}: a deadline without a source`);
    }
    const mission = checklistMission(item);
    assert.deepEqual(mission.actions, item.steps.map((step) => step.heading));
    assert.ok(mission.criteria.length >= 2 && mission.criteria.length <= 5, `${item.slug}: criteria`);
  }
});

test("the Arabic pages make no claim the product cannot keep", () => {
  const text = [read("lib/checklists-ar.mjs"), read("lib/task-tracker.mjs")].join("\n");
  // No file uploads, no mobile app, no automation, no approvals, no Arabic email promise.
  for (const claim of ["ارفع الملف", "ارفع الصور", "تطبيق الجوال متاح", "حمّل التطبيق", "تلقائيًا كل", "موافقة المدير", "رسائل البريد بالعربية"]) {
    assert.ok(!text.includes(claim), `claims "${claim}"`);
  }
  assert.ok(TASK_TRACKER_AR.free.some((line) => line.includes(String(PLAN_LIMITS.free))), "the Free plan's AI drafts come from PLAN_LIMITS");
  assert.match(TASK_TRACKER_AR.faqs.map((faq) => faq.answer).join(" "), /لا يوجد تطبيق جوال/);
});

test("analytics, the sitemap and llms.txt know every Arabic page", () => {
  assert.deepEqual([...CHECKLIST_SLUGS_AR].sort(), checklistsAr.map((item) => item.slug).sort());
  for (const item of checklistsAr) {
    assert.ok(COUNTED_ROUTES.includes(`/ar/checklists/${item.slug}`));
    assert.equal(normaliseRoute(`/ar/checklists/${item.slug}?x=1`), `/ar/checklists/${item.slug}`);
  }
  assert.ok(COUNTED_ROUTES.includes("/ar/checklists"));
  assert.ok(COUNTED_ROUTES.includes(taskTrackerPath("ar")));
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /CHECKLIST_LANGUAGES\.flatMap/);
  assert.match(sitemap, /taskTrackerPath/);
  assert.match(read("app/llms.txt/route.ts"), /checklistsIn\("ar"\)/);
  const body = buildLlmsTxt({ localized: [{ title: TASK_TRACKER_AR.title, url: taskTrackerPath("ar"), description: "x" }] });
  assert.match(body, /## In Arabic\n/);
  assert.ok(body.includes(`https://zavqera.com${taskTrackerPath("ar")}`) || body.includes(taskTrackerPath("ar")));
});

test("the Arabic pages are static, and save the checklist in its own language", () => {
  for (const path of ["app/[lang]/checklists/page.tsx", "app/[lang]/checklists/[slug]/page.tsx", "app/[lang]/employee-task-tracker/page.tsx"]) {
    assert.match(read(path), /export const dynamicParams = false;/, path);
  }
  const article = read("components/checklist-article.tsx");
  assert.match(article, /name="lang" value=\{lang\}/);
  assert.match(article, /dir=\{chrome\.dir \?\? "ltr"\}/);
  assert.match(read("lib/start-plan.ts"), /checklistBySlug\(checklist\)/);
});

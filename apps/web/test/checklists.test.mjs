import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { CHECKLIST_GROUPS, checklistBySlug, checklistMission, checklistMissionHref, checklists } from "../lib/checklists.mjs";
import { CHECKLIST_SLUGS, COUNTED_ROUTES, normaliseRoute } from "../lib/metrics-routes.mjs";

// The public checklists exist to be found in search by small businesses that
// buy software, and to be saved as a Mission in one press. The rules from the
// header of lib/checklists.mjs are checked here.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

/** Legal rules and deadlines: a step that states one must cite its source. */
const STATES_A_RULE = /\b(must|required|requires|law|within \d+|\d+ (business )?days)\b/i;
const OFFICIAL_HOST = /^https:\/\/(www\.)?([a-z0-9-]+\.)*(gov|gov\.uk)(\/|$)/;

test("slugs are unique, hyphenated, and every related slug exists", () => {
  const slugs = checklists.map((item) => item.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const item of checklists) {
    assert.match(item.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, item.slug);
    assert.ok(CHECKLIST_GROUPS.includes(item.group), `${item.slug}: group`);
    for (const related of item.related) {
      assert.ok(checklistBySlug(related), `${item.slug} links to missing ${related}`);
      assert.notEqual(related, item.slug, `${item.slug} links to itself`);
    }
  }
});

test("search titles and descriptions fit in a result", () => {
  for (const item of checklists) {
    assert.ok(item.metaTitle.length <= 60, `${item.slug}: title is ${item.metaTitle.length} characters`);
    assert.ok(item.metaDescription.length <= 160, `${item.slug}: description is ${item.metaDescription.length} characters`);
    assert.ok(item.metaDescription.length >= 90, `${item.slug}: description too short to be useful`);
  }
});

test("every step names the proof to keep, and every page has substance", () => {
  for (const item of checklists) {
    assert.ok(item.steps.length >= 6, `${item.slug}: fewer than 6 steps`);
    assert.ok(item.faqs.length >= 3, `${item.slug}: fewer than 3 questions`);
    assert.ok(item.intro.length >= 2, `${item.slug}: intro`);
    for (const step of item.steps) {
      assert.ok(step.proof && step.proof.length > 10, `${item.slug} / ${step.heading}: no proof named`);
      assert.ok(step.heading.length <= 120, `${item.slug} / ${step.heading}: heading too long for a step`);
    }
  }
});

test("a step that states a legal rule cites an official source", () => {
  for (const item of checklists) {
    for (const step of item.steps) {
      if (step.source) {
        assert.match(step.source.url, OFFICIAL_HOST, `${item.slug} / ${step.heading}: source is not an official site`);
        continue;
      }
      // Steps without a source may say a rule exists and must be checked,
      // but not state a deadline in days.
      assert.doesNotMatch(step.detail, /\b\d+ (business |calendar )?days\b/i, `${item.slug} / ${step.heading}: a deadline without a source`);
    }
  }
  assert.ok(STATES_A_RULE.test("within 20 days"));
});

test("the saved plan has one action per step, in order", () => {
  for (const item of checklists) {
    const mission = checklistMission(item);
    assert.deepEqual(mission.actions, item.steps.map((step) => step.heading));
    assert.ok(mission.criteria.length >= 2 && mission.criteria.length <= 5, `${item.slug}: criteria`);
    assert.ok(mission.intent.length > 20);
    assert.match(checklistMissionHref(item), /^\/app\/missions\/new\?/);
  }
});

test("pages make no claim the product cannot keep", () => {
  // No assignees per step, no automatic recurrence, no approvals (yet).
  const text = read("lib/checklists.mjs").toLowerCase();
  for (const claim of ["assign each step", "assign steps", "assigned to", "runs automatically", "recurring schedule", "approval workflow", "approve in zavqera"]) {
    assert.ok(!text.includes(claim), `lib/checklists.mjs claims "${claim}"`);
  }
});

test("the analytics route list, the sitemap and the footer know every checklist", () => {
  assert.deepEqual([...CHECKLIST_SLUGS].sort(), checklists.map((item) => item.slug).sort(), "CHECKLIST_SLUGS lists every checklist");
  for (const item of checklists) {
    assert.ok(COUNTED_ROUTES.includes(`/checklists/${item.slug}`));
    assert.equal(normaliseRoute(`/checklists/${item.slug}?x=1`), `/checklists/${item.slug}`);
  }
  assert.ok(COUNTED_ROUTES.includes("/checklists"));
  assert.match(read("app/sitemap.ts"), /checklistPages/);
  assert.match(read("components/shell.tsx"), /href="\/checklists"/);
});

test("the checklist button saves through the one-press start flow", () => {
  const plan = read("lib/start-plan.ts");
  assert.match(plan, /kind: "checklist"/);
  assert.match(plan, /checklistBySlug\(checklist\)/);
  assert.match(read("app/app/start/actions.ts"), /checklist: field\(formData, "checklist"\)/);
  const article = read("components/checklist-article.tsx");
  assert.match(article, /name="checklist"/);
  assert.match(article, /action=\{savePlan\}/);
});

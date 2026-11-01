import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { translateUiText } from "../lib/ui-translations.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("first-run workspace guides a new user to a real first Mission", () => {
  const page = read("app/app/page.tsx");
  assert.match(page, /const isFirstMission = missions\.length === 0 && !query && !selectedStatus/);
  assert.match(page, /className="workspace-onboarding"/);
  assert.match(page, /href="\/app\/missions\/new"/);
  assert.match(page, /href="\/templates"/);
  for (const key of ["Define the outcome", "Choose the first steps", "Review as you go"]) assert.ok(page.includes(key));
});

test("first-run onboarding does not replace search or existing-mission workflows", () => {
  const page = read("app/app/page.tsx");
  assert.match(page, /isFirstMission \? \([\s\S]*workspace-onboarding[\s\S]*\) : \([\s\S]*workspace-quick-actions/);
  assert.match(page, /mission-search/);
  assert.match(page, /visibleMissions\.map\(\(mission\) => <MissionCard/);
  assert.match(page, /selectedStatus/);
  assert.match(page, /normalizedQuery/);
});

test("all first-run copy is translated in every supported language", () => {
  const keys = ["Give your first goal a clear path.","Start with one outcome. Add the first steps, then review progress as the work changes.","Create your first mission","Turn one goal into a clear plan.","Start with a real outcome. Add the first steps you know, then keep decisions and evidence visible as work moves.","Nothing is created until you review and submit the Mission form. Your workspace is private to you.","Your first Mission, in three steps","Define the outcome","Be clear about what you want to achieve.","Choose the first steps","Add only the work you know about today.","Review as you go","Keep progress, evidence and decisions visible."];
  keys.push("Start from a template");
  for (const language of ["nb", "ar", "es", "fr", "de"]) {
    for (const key of keys) assert.notEqual(translateUiText(language, key), key, `missing ${language} translation for ${key}`);
  }
});

test("first-run onboarding remains review-before-create and makes no automatic mutations", () => {
  const page = read("app/app/page.tsx");
  assert.doesNotMatch(page, /createMission\(|repository\.createMission/);
  assert.match(page, /Nothing is created until you review and submit the Mission form/);
  const create = read("app/app/missions/new/page.tsx");
  assert.match(create, /const mission = await repository\.createMission/);
  assert.match(create, /redirect\("\/app\/missions\/" \+ mission\.id\)/);
});

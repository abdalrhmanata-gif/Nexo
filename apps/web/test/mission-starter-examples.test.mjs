import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getMissionStarterExamples, MISSION_STARTER_EXAMPLES } from "../lib/mission-starter-examples.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const languages = ["en", "nb", "ar", "es", "fr", "de"];
const expectedKeys = ["project", "research", "team-follow-up"];

test("starter examples provide the same three bounded goals in every supported language", () => {
  for (const language of languages) {
    const examples = getMissionStarterExamples(language);
    assert.deepEqual(examples.map((example) => example.key), expectedKeys, language + " has the expected starter set");
    assert.equal(new Set(examples.map((example) => example.label)).size, 3, language + " labels are unique");
    for (const example of examples) {
      assert.ok(example.label.trim(), language + "/" + example.key + " has a label");
      assert.ok(example.goal.trim(), language + "/" + example.key + " has a goal");
      assert.match(example.goal, /(?:do not|don't|ikke|لا|no |ne |kein|keine|aucun|aucune|n['’])/i, language + "/" + example.key + " preserves a boundary");
    }
  }
});

test("supported non-English starter labels and goals are localized rather than English fallbacks", () => {
  for (const language of languages.slice(1)) {
    const examples = getMissionStarterExamples(language);
    assert.ok(examples.every((example, index) =>
      example.label !== MISSION_STARTER_EXAMPLES.en[index].label &&
      example.goal !== MISSION_STARTER_EXAMPLES.en[index].goal
    ), language + " has localized labels and goals");
  }
  assert.deepEqual(getMissionStarterExamples("unknown"), MISSION_STARTER_EXAMPLES.en);
});

test("anonymous and authenticated mission entry use the same selected-language examples", () => {
  const anonymous = read("components/anonymous-plan-form.tsx");
  const authenticated = read("components/mission-create-form.tsx");
  assert.match(anonymous, /getMissionStarterExamples\(language\)/);
  assert.match(anonymous, /setGoal\(example\.goal\)/);
  assert.match(authenticated, /getMissionStarterExamples\(language\)/);
  assert.match(authenticated, /handleExampleClick\(example\.goal\)/);
});

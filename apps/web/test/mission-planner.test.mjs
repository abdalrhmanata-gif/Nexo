import assert from "node:assert/strict";
import test from "node:test";
import { planHeadline, planIsThin, suggestPlanFor } from "../lib/mission-planner.mjs";

const mission = (over = {}) => ({
  name: "", intent: "", criteria: [], actions: [], ...over,
});
const action = (title, status = "PENDING") => ({ id: title, title, status, version: 1, followUpAt: null });

test("a mission with no actions has a thin plan", () => {
  assert.equal(planIsThin(mission({ name: "Open a pharmacy" })), true);
});

test("a single action that only echoes the mission name is still a thin plan", () => {
  // This is the exact state a mission lands in when the same words are typed
  // into the name, the criterion and the first action.
  assert.equal(planIsThin(mission({ name: "bra apotek", actions: [action("bra apotek")] })), true);
  assert.equal(planIsThin(mission({ name: "Open a pharmacy", actions: [action("pharmacy")] })), true);
});

test("a mission with real distinct work is not thin", () => {
  const m = mission({
    name: "Open a pharmacy",
    actions: [action("Confirm the licence requirements"), action("Model the running costs")],
  });
  assert.equal(planIsThin(m), false);
});

test("cancelled actions do not count as a plan", () => {
  const m = mission({ name: "Open a pharmacy", actions: [action("Something", "CANCELLED")] });
  assert.equal(planIsThin(m), true);
});

test("opening a pharmacy is recognised as a venture, and as licensed", () => {
  const plan = suggestPlanFor(mission({ name: "jeg vil åpne ny apotek", intent: "to åpne min apotek i norge" }));
  assert.equal(plan.kind, "venture");
  assert.equal(plan.licensed, true);
  assert.equal(plan.steps.length, 7);
  assert.ok(plan.criteria.length > 0);
});

test("venture detection works in every language the product ships in", () => {
  for (const intent of [
    "open a pharmacy in Norway",
    "åpne et apotek",
    "أريد افتتاح صيدلية في النرويج",
    "abrir una farmacia",
    "ouvrir une pharmacie",
    "eine Apotheke eröffnen",
  ]) {
    const plan = suggestPlanFor(mission({ intent }));
    assert.equal(plan.kind, "venture", `expected a venture plan for: ${intent}`);
    assert.equal(plan.licensed, true, `expected a licensed venture for: ${intent}`);
  }
});

test("an unregulated shop is a venture but not licensed", () => {
  const plan = suggestPlanFor(mission({ intent: "open a bookshop" }));
  assert.equal(plan.kind, "venture");
  assert.equal(plan.licensed, false);
});

test("hiring and product intents get their own plans", () => {
  assert.equal(suggestPlanFor(mission({ intent: "hire a second engineer" })).kind, "hiring");
  assert.equal(suggestPlanFor(mission({ intent: "launch the mobile app" })).kind, "product");
});

test("anything else still gets a usable generic plan", () => {
  const plan = suggestPlanFor(mission({ intent: "reduce the time it takes to close the books" }));
  assert.equal(plan.kind, "generic");
  assert.ok(plan.steps.length >= 3);
});

test("a mission that says almost nothing gets no plan rather than noise", () => {
  assert.equal(suggestPlanFor(mission({ intent: "x" })), null);
  assert.equal(suggestPlanFor(mission()), null);
});

test("every plan kind has a headline", () => {
  for (const kind of ["venture", "hiring", "product", "generic"]) {
    assert.equal(typeof planHeadline(kind), "string");
    assert.ok(planHeadline(kind).length > 0);
  }
});

test("no proposed step asserts a fact about law, price or market", () => {
  // The product's own rule: it may propose structure and questions, never
  // claims the user has not verified.
  const forbidden = /\b(must pay|costs?\s+\$|is required by law|the law says|guaranteed|will succeed|you need a licence from)\b/i;
  for (const intent of ["open a pharmacy", "hire a nurse", "launch the app", "something else entirely"]) {
    const plan = suggestPlanFor(mission({ intent }));
    for (const step of [...plan.steps, ...plan.criteria]) {
      assert.doesNotMatch(step, forbidden, `step asserts an unverified fact: ${step}`);
    }
  }
});

test("the planner accepts a half-typed draft, which is what the new-mission form passes", () => {
  // The form calls this on every keystroke with no id, no status and no saved
  // actions. It must answer on the intent alone and must never throw.
  assert.equal(suggestPlanFor({ name: "", intent: "jeg vil åpne ny apotek", criteria: [], actions: [] }).kind, "venture");
  assert.equal(suggestPlanFor({ name: "åpne apotek" }).kind, "venture");
  assert.equal(suggestPlanFor({}), null);
  assert.equal(suggestPlanFor({ intent: "" }), null);
  assert.doesNotThrow(() => suggestPlanFor({ name: undefined, intent: undefined, criteria: undefined }));
});

test("a plan is recognised from the name alone, before an intent is typed", () => {
  // Someone types the mission name first; the suggestion should not wait.
  const plan = suggestPlanFor({ name: "Open a pharmacy in Bergen", intent: "" });
  assert.equal(plan.kind, "venture");
  assert.equal(plan.licensed, true);
});

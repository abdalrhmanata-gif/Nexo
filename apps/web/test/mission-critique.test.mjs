import assert from "node:assert/strict";
import test from "node:test";
import { critiqueMission, planIsThin } from "../lib/mission-critique.mjs";

const mission = (over = {}) => ({ name: "", intent: "", criteria: [], actions: [], ...over });
const action = (title, over = {}) => ({ id: title, title, status: "PENDING", version: 1, followUpAt: null, ...over });
const codes = (m) => critiqueMission(m).map((finding) => finding.code);

// The mission from the report: a criterion and a step that are the same three
// words, under a heading that said "No issues detected".
const REPORTED = mission({
  name: "jeg vil reise til usa",
  intent: "jeg vil reise til usa og canada",
  criteria: ["usa and canada"],
  actions: [action("usa and canada")],
});

test("the mission that was called healthy is not healthy", () => {
  const found = codes(REPORTED);
  assert.ok(found.includes("criterion-not-checkable"), "a bare place name is not a checkable result");
  assert.ok(found.includes("action-repeats-criterion"), "a step that is also a criterion is not work");
  assert.ok(found.length >= 2);
});

test("every finding about the user's words quotes those words back", () => {
  for (const finding of critiqueMission(REPORTED)) {
    if (finding.quote === null) continue;
    assert.ok(finding.message.includes("{text}"), `${finding.code} has a quote but nowhere to put it`);
    assert.ok(finding.quote.trim().length > 0);
  }
});

test("a criterion with a number or enough substance is left alone", () => {
  for (const criterion of [
    "Open to customers by 1 March 2027",
    "The licence is confirmed in writing by the authority",
    "Monthly revenue covers rent and salaries",
  ]) {
    const found = codes(mission({ criteria: [criterion], actions: [action("Call the council")] }));
    assert.ok(!found.includes("criterion-not-checkable"), `wrongly flagged: ${criterion}`);
  }
});

test("a bare noun phrase is flagged whatever language it is in", () => {
  for (const criterion of ["usa and canada", "bra apotek", "صيدلية جيدة", "buena farmacia"]) {
    const found = codes(mission({ criteria: [criterion], actions: [action("Call the council")] }));
    assert.ok(found.includes("criterion-not-checkable"), `missed: ${criterion}`);
  }
});

test("a real step is not mistaken for a restatement of the goal", () => {
  // "Call the pharmacy" shares a word with the goal but is plainly work.
  const found = codes(mission({
    name: "Open a pharmacy", intent: "open a pharmacy in Bergen",
    criteria: ["The licence is confirmed in writing by the authority"],
    actions: [action("Call the municipal planning office")],
  }));
  assert.ok(!found.includes("action-restates-goal"), "a genuine step must not be flagged");
  assert.ok(!found.includes("action-repeats-criterion"));
});

test("a step built only from the goal's own words is flagged", () => {
  const found = codes(mission({
    name: "Open a pharmacy in Bergen", intent: "open a pharmacy in Bergen",
    criteria: ["Licence confirmed in writing by the authority"],
    actions: [action("pharmacy Bergen")],
  }));
  assert.ok(found.includes("action-restates-goal"));
});

test("a mission with no criteria and no steps says both", () => {
  const found = codes(mission({ name: "Something", intent: "do something useful" }));
  assert.ok(found.includes("no-criteria"));
  assert.ok(found.includes("no-actions"));
});

test("steps with no follow-up date are noted, but only as information", () => {
  const findings = critiqueMission(mission({
    name: "Open a pharmacy", intent: "open a pharmacy in Bergen",
    criteria: ["The licence is confirmed in writing by the authority"],
    actions: [action("Call the municipal planning office")],
  }));
  const followUp = findings.find((finding) => finding.code === "no-follow-up");
  assert.ok(followUp);
  assert.equal(followUp.severity, "info");
});

test("a well-written mission draws no complaint", () => {
  const findings = critiqueMission(mission({
    name: "Open a pharmacy in Bergen",
    intent: "open a licensed pharmacy serving the Bergen city centre",
    criteria: ["The licence is confirmed in writing by the authority", "Break-even is reached within 18 months"],
    actions: [action("Call the municipal planning office", { followUpAt: "2027-01-10T09:00:00Z" })],
  }));
  assert.deepEqual(findings, []);
});

test("high findings sort above informational ones", () => {
  const findings = critiqueMission(REPORTED);
  const severities = findings.map((finding) => finding.severity);
  assert.deepEqual(severities, [...severities].sort((a, b) => (a === "high" ? 0 : 1) - (b === "high" ? 0 : 1)));
});

test("thin now catches a step that repeats a criterion, which is what was missed", () => {
  // This mission has one action, so the old check called it a plan and the
  // suggestion card never appeared.
  assert.equal(planIsThin(REPORTED), true);
});

test("thin still catches the empty and echoing cases", () => {
  assert.equal(planIsThin(mission({ name: "Open a pharmacy" })), true);
  assert.equal(planIsThin(mission({ name: "bra apotek", actions: [action("bra apotek")] })), true);
  assert.equal(planIsThin(mission({ name: "x", actions: [action("Something", { status: "CANCELLED" })] })), true);
});

test("a mission with genuine work is not thin", () => {
  const m = mission({
    name: "Open a pharmacy", intent: "open a pharmacy in Bergen",
    actions: [action("Call the municipal planning office"), action("Price the fit-out")],
  });
  assert.equal(planIsThin(m), false);
});

test("critique never throws on a half-formed mission", () => {
  assert.doesNotThrow(() => critiqueMission({}));
  assert.doesNotThrow(() => critiqueMission(mission({ criteria: ["", "  "], actions: [action("")] })));
  assert.doesNotThrow(() => planIsThin({}));
});

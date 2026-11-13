import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceToRow,
  opportunitiesFromRows,
  opportunityToRow,
  planBrowserUpload,
  readBrowserOpportunities,
} from "../lib/opportunity-account.mjs";

// Opportunities used to live only in the browser. These are the pure pieces of
// moving them to the account: the shape of a stored row, and the decision about
// what a browser still holds that the account does not.

const evidence = (overrides = {}) => ({
  id: "evidence-1",
  url: "https://example.com/report",
  title: "Public report",
  observation: "The report describes a relevant customer need.",
  stance: "supports",
  sourceType: "research",
  sourceDate: "2026-10-01",
  reliability: 4,
  checkedAt: "2026-10-15T10:00:00.000Z",
  addedAt: 1792060000000,
  ...overrides,
});

const opportunity = (overrides = {}) => ({
  id: "opportunity-1",
  title: "Validate a customer need",
  target: "Small businesses",
  thesis: "Small businesses may need a clearer workflow.",
  evidenceUrl: "https://example.com",
  evidenceItems: [evidence()],
  strategicFit: 4,
  potentialValue: 5,
  urgency: 3,
  evidenceStrength: 4,
  effort: 2,
  createdAt: 1792060000000,
  ...overrides,
});

test("an opportunity row names every stored column and never names its owner", () => {
  const row = opportunityToRow(opportunity());
  assert.deepEqual(row, {
    id: "opportunity-1",
    title: "Validate a customer need",
    target: "Small businesses",
    thesis: "Small businesses may need a clearer workflow.",
    evidence_url: "https://example.com",
    strategic_fit: 4,
    potential_value: 5,
    urgency: 3,
    evidence_strength: 4,
    effort: 2,
    created_at_ms: 1792060000000,
  });
  // Ownership comes from the session in the database. A row that carried a
  // user id would be a request to write into a named account.
  assert.equal("user_id" in row, false);
});

test("an evidence row is tied to its opportunity and never names its owner", () => {
  const row = evidenceToRow("opportunity-1", evidence());
  assert.deepEqual(row, {
    opportunity_id: "opportunity-1",
    id: "evidence-1",
    url: "https://example.com/report",
    title: "Public report",
    observation: "The report describes a relevant customer need.",
    stance: "supports",
    source_type: "research",
    source_date: "2026-10-01",
    reliability: 4,
    checked_at: "2026-10-15T10:00:00.000Z",
    added_at_ms: 1792060000000,
  });
  assert.equal("user_id" in row, false);
});

test("timestamps are stored as whole milliseconds", () => {
  assert.equal(opportunityToRow(opportunity({ createdAt: 1792060000000.6 })).created_at_ms, 1792060000001);
  assert.equal(evidenceToRow("o", evidence({ addedAt: 12.2 })).added_at_ms, 12);
});

test("what was stored comes back as the same opportunity", () => {
  const original = opportunity({ evidenceItems: [evidence({ id: "b", addedAt: 20 }), evidence({ id: "a", addedAt: 10 })] });
  const stored = {
    ...opportunityToRow(original),
    opportunity_evidence_items: original.evidenceItems.map((item) => evidenceToRow(original.id, item)),
  };
  const [restored] = opportunitiesFromRows([stored]);
  // Evidence notes come back in the order they were added, whatever order
  // the database returned them in.
  assert.deepEqual(restored, { ...original, evidenceItems: [evidence({ id: "a", addedAt: 10 }), evidence({ id: "b", addedAt: 20 })] });
});

test("rows without evidence, and an empty or missing result, are read safely", () => {
  const { opportunity_evidence_items: _unused, ...bare } = { ...opportunityToRow(opportunity()), opportunity_evidence_items: [] };
  assert.deepEqual(opportunitiesFromRows([bare])[0].evidenceItems, []);
  assert.deepEqual(opportunitiesFromRows([]), []);
  assert.deepEqual(opportunitiesFromRows(null), []);
});

test("the browser's stored text is read without trusting it", () => {
  assert.deepEqual(readBrowserOpportunities(null), []);
  assert.deepEqual(readBrowserOpportunities(""), []);
  assert.deepEqual(readBrowserOpportunities("{"), []);
  assert.deepEqual(readBrowserOpportunities(JSON.stringify({ not: "a list" })), []);
  assert.deepEqual(readBrowserOpportunities(JSON.stringify([opportunity()])), [opportunity()]);
});

test("everything valid in the browser is uploaded when the account is empty", () => {
  const second = opportunity({ id: "opportunity-2", evidenceItems: [] });
  const plan = planBrowserUpload([opportunity(), second], []);
  assert.deepEqual(plan.opportunityRows, [opportunityToRow(opportunity()), opportunityToRow(second)]);
  assert.deepEqual(plan.evidenceRows, [evidenceToRow("opportunity-1", evidence())]);
  assert.equal(plan.leftBehindCount, 0);
});

test("an opportunity the account already holds is not uploaded again", () => {
  // The same person on a second device, or a second tab that got there first.
  // The account's copy of the opportunity is the one that stands.
  const inAccount = opportunity({ title: "The account's copy" });
  const plan = planBrowserUpload([opportunity(), opportunity({ id: "opportunity-2" })], [inAccount]);
  assert.deepEqual(plan.opportunityRows.map((row) => row.id), ["opportunity-2"]);
  assert.deepEqual(plan.evidenceRows.map((row) => row.opportunity_id), ["opportunity-2"]);
  assert.equal(plan.leftBehindCount, 0);
});

test("an evidence note the account lacks is still uploaded for an opportunity it holds", () => {
  // An upload that stored the opportunities and then lost its connection
  // before the evidence: the next attempt must finish the job, not conclude
  // from the opportunity being there that everything is.
  const inAccount = opportunity({ evidenceItems: [] });
  const plan = planBrowserUpload([opportunity({ evidenceItems: [evidence(), evidence({ id: "evidence-2" })] })], [inAccount]);
  assert.deepEqual(plan.opportunityRows, []);
  assert.deepEqual(plan.evidenceRows.map((row) => row.id), ["evidence-1", "evidence-2"]);

  const partly = opportunity({ evidenceItems: [evidence()] });
  const rest = planBrowserUpload([opportunity({ evidenceItems: [evidence(), evidence({ id: "evidence-2" })] })], [partly]);
  assert.deepEqual(rest.evidenceRows.map((row) => row.id), ["evidence-2"]);
});

test("a record the database would refuse stays in the browser and does not block the rest", () => {
  const plan = planBrowserUpload([
    opportunity({ id: "bad-rating", strategicFit: 9 }),
    opportunity({ id: "bad-link", evidenceUrl: "javascript:alert(1)" }),
    "not an object",
    null,
    opportunity({ id: "good" }),
  ], []);
  assert.deepEqual(plan.opportunityRows.map((row) => row.id), ["good"]);
  assert.equal(plan.leftBehindCount, 4);
});

test("an older browser record without an evidence list is uploaded with none", () => {
  const { evidenceItems: _unused, ...legacy } = opportunity({ id: "legacy" });
  const plan = planBrowserUpload([legacy], []);
  assert.deepEqual(plan.opportunityRows.map((row) => row.id), ["legacy"]);
  assert.deepEqual(plan.evidenceRows, []);
});

test("a malformed evidence note is dropped without losing its opportunity", () => {
  const plan = planBrowserUpload([opportunity({ evidenceItems: [evidence(), { id: "broken" }] })], []);
  assert.deepEqual(plan.opportunityRows.map((row) => row.id), ["opportunity-1"]);
  assert.deepEqual(plan.evidenceRows.map((row) => row.id), ["evidence-1"]);
});

test("a repeated id inside the browser's own list is uploaded once", () => {
  const plan = planBrowserUpload([opportunity(), opportunity({ title: "Second with the same id" })], []);
  assert.equal(plan.opportunityRows.length, 1);
  assert.equal(plan.opportunityRows[0].title, "Validate a customer need");
  assert.equal(plan.evidenceRows.length, 1);
});

test("a repeated evidence id inside one opportunity is uploaded once", () => {
  const plan = planBrowserUpload([opportunity({ evidenceItems: [evidence(), evidence({ title: "Same id again" })] })], []);
  assert.equal(plan.evidenceRows.length, 1);
});

test("nothing in the browser means nothing to do", () => {
  const plan = planBrowserUpload([], [opportunity()]);
  assert.deepEqual(plan, { opportunityRows: [], evidenceRows: [], leftBehindCount: 0 });
  assert.deepEqual(planBrowserUpload("not a list", []), { opportunityRows: [], evidenceRows: [], leftBehindCount: 0 });
});

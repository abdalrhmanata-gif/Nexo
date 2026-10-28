import test from "node:test";
import assert from "node:assert/strict";
import { opportunityPriority, priorityDescription, scoreOpportunity } from "../lib/opportunity-intelligence.mjs";

const makeOpportunity = (overrides = {}) => ({
  strategicFit: 5,
  potentialValue: 5,
  urgency: 5,
  evidenceStrength: 5,
  effort: 1,
  ...overrides,
});

test("best-aligned, high-value, well-evidenced, urgent and low-effort opportunity scores 100", () => {
  assert.equal(scoreOpportunity(makeOpportunity()), 100);
});

test("weak factors and maximum effort score 20", () => {
  assert.equal(scoreOpportunity(makeOpportunity({
    strategicFit: 1,
    potentialValue: 1,
    urgency: 1,
    evidenceStrength: 1,
    effort: 5,
  })), 20);
});

test("score is rounded and ratings are clamped to the 1–5 range", () => {
  const baseline = scoreOpportunity(makeOpportunity({
    strategicFit: 5,
    potentialValue: 5,
    urgency: 5,
    evidenceStrength: 5,
    effort: 1,
  }));
  assert.equal(scoreOpportunity(makeOpportunity({
    strategicFit: 500,
    potentialValue: 5,
    urgency: 5,
    evidenceStrength: 5,
    effort: -100,
  })), baseline);
  assert.equal(scoreOpportunity(makeOpportunity({
    strategicFit: Number.NaN,
    potentialValue: 3,
    urgency: 3,
    evidenceStrength: 3,
    effort: 3,
  })), 50);
});

test("priority thresholds are stable and readable", () => {
  assert.equal(opportunityPriority(79), "VALIDATE");
  assert.equal(opportunityPriority(80), "PURSUE");
  assert.equal(opportunityPriority(59), "HOLD");
  assert.equal(opportunityPriority(60), "VALIDATE");
  assert.match(priorityDescription("PURSUE"), /Confirm the evidence/);
  assert.match(priorityDescription("VALIDATE"), /weakest assumption/);
  assert.match(priorityDescription("HOLD"), /improve the evidence/);
});

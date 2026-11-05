import assert from "node:assert/strict";
import test from "node:test";
import { attentionFor, rankByAttention } from "../lib/mission-attention.mjs";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays) => new Date(NOW + offsetDays * DAY).toISOString();

const mission = (over = {}) => ({
  id: over.id ?? "m", name: "Mission", intent: "", status: "ACTIVE",
  updated: iso(0), actions: [], criteria: [], ...over,
});
const action = (over = {}) => ({ id: "a", title: "Step", status: "PENDING", version: 1, followUpAt: null, ...over });

test("a completed mission needs nobody", () => {
  const result = attentionFor(mission({ status: "COMPLETED", actions: [] }), NOW);
  assert.equal(result.score, 0);
  assert.equal(result.reason, null);
});

test("a healthy, recently moved mission does not demand attention", () => {
  const m = mission({ actions: [action({ status: "RUNNING" })], updated: iso(-1) });
  assert.equal(attentionFor(m, NOW).score, 0);
});

test("a waiting mission is explained by the decision it is paused on", () => {
  const result = attentionFor(mission({ status: "WAITING", actions: [action({ status: "RUNNING" })] }), NOW);
  assert.ok(result.score > 0);
  assert.match(result.reason, /resolve the open decision/);
});

test("a mission with no steps says so, rather than saying nothing", () => {
  const result = attentionFor(mission({ actions: [] }), NOW);
  assert.match(result.reason, /no step that would reach it/);
});

test("the longer a follow-up is overdue, the more it outranks", () => {
  const mild = attentionFor(mission({ actions: [action({ followUpAt: iso(-1) })] }), NOW);
  const severe = attentionFor(mission({ actions: [action({ followUpAt: iso(-25) })] }), NOW);
  assert.ok(severe.score > mild.score, "25 days overdue must outrank 1 day overdue");
  assert.match(severe.reason, /already overdue/);
});

test("an overdue follow-up outranks one merely due this week", () => {
  const soon = attentionFor(mission({ actions: [action({ followUpAt: iso(3) })] }), NOW);
  const overdue = attentionFor(mission({ actions: [action({ followUpAt: iso(-3) })] }), NOW);
  assert.ok(overdue.score > soon.score);
  assert.match(soon.reason, /falls due within the week/);
});

test("a long-idle mission is surfaced before it is forgotten", () => {
  const idle = attentionFor(mission({ actions: [action({ status: "RUNNING" })], updated: iso(-40) }), NOW);
  assert.ok(idle.score > 0);
  assert.match(idle.reason, /Nothing has moved/);
});

test("recency is not urgency: the most stuck mission wins, not the newest", () => {
  // This is the behaviour that was wrong. The waiting mission was edited three
  // weeks ago; the healthy one was edited an hour ago and used to come first.
  const stuck = mission({ id: "stuck", status: "WAITING", updated: iso(-21), actions: [action({ status: "RUNNING" })] });
  const fresh = mission({ id: "fresh", updated: iso(0), actions: [action({ status: "RUNNING" })] });
  const ranked = rankByAttention([fresh, stuck], NOW);
  assert.equal(ranked[0].mission.id, "stuck");
  assert.equal(ranked.length, 1, "a healthy mission should not be listed at all");
});

test("every ranked mission carries the reason it was ranked", () => {
  const ranked = rankByAttention([
    mission({ id: "a", status: "WAITING" }),
    mission({ id: "b", actions: [action({ followUpAt: iso(-9) })] }),
    mission({ id: "c", actions: [] }),
  ], NOW);
  assert.equal(ranked.length, 3);
  for (const entry of ranked) {
    assert.equal(typeof entry.reason, "string");
    assert.ok(entry.reason.length > 0, "a ranked mission with no reason is a number with no account of itself");
  }
});

test("ranking is stable for ties and never includes completed missions", () => {
  const a = mission({ id: "a", actions: [] });
  const b = mission({ id: "b", actions: [] });
  const done = mission({ id: "done", status: "COMPLETED", actions: [] });
  const ranked = rankByAttention([a, b, done], NOW);
  assert.deepEqual(ranked.map((entry) => entry.mission.id), ["a", "b"]);
});

test("two mild problems can outrank one moderate problem", () => {
  const moderate = attentionFor(mission({ actions: [action({ followUpAt: iso(2) })] }), NOW);
  const compound = attentionFor(mission({
    actions: [action({ followUpAt: iso(2) })], updated: iso(-30),
  }), NOW);
  assert.ok(compound.score > moderate.score);
});

test("an empty or missing list ranks to nothing rather than throwing", () => {
  assert.deepEqual(rankByAttention([], NOW), []);
  assert.deepEqual(rankByAttention(undefined, NOW), []);
  assert.equal(attentionFor(null, NOW).score, 0);
});

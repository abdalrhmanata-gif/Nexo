import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicSearchUrls,
  findDuplicateEvidence,
  isHttpSourceUrl,
  isOpportunityEvidenceItem,
  normaliseEvidenceUrl,
  summariseEvidence,
  validateMissionEvidencePayload,
  validateMissionOutcomeDecision,
} from "../lib/evidence-ledger.mjs";

test("only public HTTP and HTTPS URLs are accepted as source references", () => {
  assert.equal(isHttpSourceUrl("https://example.com/report"), true);
  assert.equal(isHttpSourceUrl("http://example.com"), true);
  assert.equal(isHttpSourceUrl("javascript:alert(1)"), false);
  assert.equal(isHttpSourceUrl("file:///etc/passwd"), false);
  assert.equal(isHttpSourceUrl("not a URL"), false);
});

test("canonical URL removes tracking noise without changing the displayed citation", () => {
  assert.equal(
    normaliseEvidenceUrl("https://www.Example.com/report/?utm_source=newsletter#section"),
    "https://example.com/report",
  );
  assert.equal(normaliseEvidenceUrl("https://example.com/a?b=2&a=1"), "https://example.com/a?a=1&b=2");
  assert.equal(normaliseEvidenceUrl("javascript:alert(1)"), null);
});

test("duplicate detection catches repeated sources and the legacy source field", () => {
  const evidence = [{ url: "https://example.com/report?utm_campaign=test" }];
  assert.equal(findDuplicateEvidence(evidence, "https://www.example.com/report"), true);
  assert.equal(findDuplicateEvidence([], "https://example.com/report", "https://example.com/report/#top"), true);
  assert.equal(findDuplicateEvidence(evidence, "https://example.org/other"), false);
  assert.equal(findDuplicateEvidence(evidence, "data:text/plain,no"), false);
});

test("evidence summary reports counter-signals and mixed evidence without claiming verification", () => {
  assert.deepEqual(summariseEvidence([]), {
    total: 0, supports: 0, challenges: 0, context: 0, highReliability: 0,
    signal: "NO_RECORDED_EVIDENCE",
  });
  const mixed = summariseEvidence([
    { stance: "supports", reliability: 4 },
    { stance: "challenges", reliability: 2 },
    { stance: "context", reliability: 5 },
  ]);
  assert.equal(mixed.signal, "MIXED_SIGNALS");
  assert.equal(mixed.supports, 1);
  assert.equal(mixed.challenges, 1);
  assert.equal(mixed.context, 1);
  assert.equal(mixed.highReliability, 2);
  assert.equal(summariseEvidence([{ stance: "supports", reliability: 2 }]).signal, "SUPPORT_SIGNALS_RECORDED");
  assert.equal(summariseEvidence([{ stance: "challenges", reliability: 2 }]).signal, "COUNTER_SIGNALS_RECORDED");
  assert.equal(summariseEvidence([{ stance: "context", reliability: 3 }]).signal, "CONTEXT_ONLY");
});

test("search links encode the user's opportunity as a query rather than fetching it server-side", () => {
  const result = buildPublicSearchUrls({
    title: "Lower-cost pharmacy service",
    target: "small towns",
    thesis: "Customers need a better option & faster access",
  });
  assert.match(result.webUrl, /^https:\/\/www\.google\.com\/search\?/);
  assert.match(result.newsUrl, /tbm=nws/);
  assert.ok(result.query.includes("small towns"));
  assert.ok(result.webUrl.includes("faster+access"));
  assert.equal(buildPublicSearchUrls({}).webUrl, "https://www.google.com/");
});

test("persisted evidence records must have bounded metadata and a safe source URL", () => {
  const valid = {
    id: "evidence-1",
    url: "https://example.com/report",
    title: "Published market report",
    observation: "The source reports a stated market change.",
    stance: "supports",
    sourceType: "research",
    sourceDate: "2026-09-30",
    reliability: 4,
    checkedAt: "2026-10-28T12:00:00.000Z",
    addedAt: 1793190000000,
  };
  assert.equal(isOpportunityEvidenceItem(valid), true);
  assert.equal(isOpportunityEvidenceItem({ ...valid, url: "javascript:alert(1)" }), false);
  assert.equal(isOpportunityEvidenceItem({ ...valid, stance: "verified" }), false);
  assert.equal(isOpportunityEvidenceItem({ ...valid, reliability: 8 }), false);
  assert.equal(isOpportunityEvidenceItem({ ...valid, observation: "" }), false);
});

test("public search queries are bounded before they leave the browser", () => {
  const result = buildPublicSearchUrls({ title: "x".repeat(500) });
  assert.equal(result.query.length, 360);
});


test("Mission evidence payload normalises reviewed sources and keeps source references safe", () => {
  const input = {
    summary: "The recorded sources support this decision.",
    items: [{
      id: "evidence-0001",
      title: "Official release note",
      observation: "The official note confirms the feature was released.",
      referenceUrl: "https://www.example.com/release?utm_source=test",
      sourceType: "official",
      stance: "supports",
      publishedAt: "2026-10-25",
    }],
  };
  const result = validateMissionEvidencePayload(input);
  assert.equal(result.valid, true);
  assert.equal(result.value.independentVerification, false);
  assert.equal(result.value.recordType, "USER_REVIEWED_EVIDENCE");
  assert.equal(result.value.items[0].referenceUrl, "https://www.example.com/release?utm_source=test");
  assert.equal(validateMissionEvidencePayload({ ...input, items: [{ ...input.items[0], referenceUrl: "javascript:alert(1)" }] }).valid, false);
  assert.equal(validateMissionEvidencePayload({ ...input, items: [{ ...input.items[0], publishedAt: "2026-02-30" }] }).valid, false);
  assert.equal(validateMissionEvidencePayload({ ...input, items: [{ ...input.items[0], stance: "verified" }] }).valid, false);
  assert.equal(validateMissionEvidencePayload({ ...input, items: [{ ...input.items[0], title: " " }] }).valid, false);
});

test("Mission evidence payload enforces source count, duplicate URLs and content bounds", () => {
  const item = { id: "evidence-0001", title: "Source", observation: "Observed fact.", referenceUrl: "https://example.com/source", sourceType: "research", stance: "challenges", publishedAt: "" };
  const base = { summary: "A sufficiently long evidence summary.", items: [item] };
  assert.equal(validateMissionEvidencePayload(base).valid, true);
  assert.equal(validateMissionEvidencePayload({ ...base, items: [] }).valid, false);
  assert.equal(validateMissionEvidencePayload({ ...base, items: Array.from({ length: 9 }, (_, i) => ({ ...item, id: "evidence-" + String(i).padStart(4, "0"), referenceUrl: "" })) }).valid, false);
  assert.equal(validateMissionEvidencePayload({ ...base, items: [item, { ...item, id: "evidence-0002", referenceUrl: "https://www.example.com/source?utm_campaign=duplicate" }] }).valid, false);
  assert.equal(validateMissionEvidencePayload({ summary: "short", items: [item] }).valid, false);
  assert.equal(validateMissionEvidencePayload({ ...base, items: [{ ...item, observation: "x".repeat(1201) }] }).valid, false);
});

test("human outcome decisions map consistently to the existing completed and failed statuses", () => {
  const proceed = validateMissionOutcomeDecision({
    summary: "The intended outcome was reached.",
    decision: "PROCEED",
    rationale: "The reviewed evidence satisfies the success criteria.",
  });
  assert.equal(proceed.valid, true);
  assert.equal(proceed.status, "COMPLETED");
  assert.equal(proceed.value.decisionType, "HUMAN_OUTCOME_DECISION");

  const stop = validateMissionOutcomeDecision({
    summary: "The target outcome was not reached.",
    decision: "STOP",
    rationale: "The evidence does not support continuing this mission.",
  });
  assert.equal(stop.valid, true);
  assert.equal(stop.status, "FAILED");
  assert.equal(validateMissionOutcomeDecision({ summary: "Done", decision: "PROCEED", rationale: "Too short" }).valid, false);
  assert.equal(validateMissionOutcomeDecision({ summary: "Done", decision: "STOP", rationale: "The evidence does not support this.", }, "COMPLETED").valid, false);
  assert.equal(validateMissionOutcomeDecision(null).valid, false);
});

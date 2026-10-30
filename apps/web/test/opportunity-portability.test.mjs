import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OPPORTUNITY_BACKUP_BYTES,
  OPPORTUNITY_BACKUP_FORMAT,
  createOpportunityBackup,
  mergeOpportunityBackup,
  parseOpportunityBackup,
} from "../lib/opportunity-portability.mjs";

const evidence = {
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
};

const opportunity = (overrides = {}) => ({
  id: "opportunity-1",
  title: "Validate a customer need",
  target: "Small businesses",
  thesis: "Small businesses may need a clearer workflow.",
  evidenceUrl: "https://example.com",
  evidenceItems: [evidence],
  strategicFit: 4,
  potentialValue: 5,
  urgency: 3,
  evidenceStrength: 4,
  effort: 2,
  createdAt: 1792060000000,
  ...overrides,
});

const encoded = (items = [opportunity()], options = {}) => JSON.stringify({
  format: OPPORTUNITY_BACKUP_FORMAT,
  version: 1,
  exportedAt: "2026-10-29T12:00:00.000Z",
  opportunityCount: items.length,
  evidenceCount: items.reduce((sum, item) => sum + item.evidenceItems.length, 0),
  opportunities: items,
  ...options,
});

test("backup round-trips opportunities and all evidence ledger fields", () => {
  const backup = createOpportunityBackup([opportunity()], "2026-10-29T12:00:00.000Z");
  const restored = parseOpportunityBackup(JSON.stringify(backup));
  assert.equal(restored.version, 1);
  assert.equal(restored.opportunityCount, 1);
  assert.equal(restored.evidenceCount, 1);
  assert.deepEqual(restored.opportunities[0], opportunity());
  assert.equal(restored.exportedAt, "2026-10-29T12:00:00.000Z");
});

test("backup only exports the declared fields, not unknown properties", () => {
  const backup = createOpportunityBackup([opportunity({ unexpectedSecret: "must not be exported" })]);
  assert.equal("unexpectedSecret" in backup.opportunities[0], false);
});

test("empty backups are valid and useful when moving to a new device", () => {
  const restored = parseOpportunityBackup(JSON.stringify(createOpportunityBackup([])));
  assert.equal(restored.opportunityCount, 0);
  assert.deepEqual(restored.opportunities, []);
});

test("rejects malformed JSON, foreign formats, and unsupported versions", () => {
  assert.throws(() => parseOpportunityBackup("{"), /not valid JSON/i);
  assert.throws(() => parseOpportunityBackup(JSON.stringify({ format: "other", version: 1 })), /not a supported Zavqera/i);
  assert.throws(() => parseOpportunityBackup(encoded([opportunity()], { version: 2 })), /not a supported Zavqera/i);
});

test("rejects an oversized import before attempting JSON parsing", () => {
  assert.throws(() => parseOpportunityBackup(" ".repeat(MAX_OPPORTUNITY_BACKUP_BYTES + 1)), /larger than 2 MB/i);
});

test("rejects unsafe URLs, invalid ratings, invalid evidence, and duplicate IDs atomically", () => {
  assert.throws(() => parseOpportunityBackup(encoded([opportunity({ evidenceUrl: "javascript:alert(1)" })])), /invalid opportunity or evidence/i);
  assert.throws(() => parseOpportunityBackup(encoded([opportunity({ strategicFit: 500 })])), /invalid opportunity or evidence/i);
  assert.throws(() => parseOpportunityBackup(encoded([opportunity({ evidenceItems: [{ ...evidence, url: "file:///private" }] })])), /invalid opportunity or evidence/i);
  assert.throws(() => parseOpportunityBackup(encoded([opportunity(), opportunity()])), /duplicate opportunity IDs/i);
});


test("export refuses a backup that would exceed the same 2 MB import limit", () => {
  const largeEvidence = Array.from({ length: 200 }, (_, index) => ({
    ...evidence,
    id: `evidence-${index}`,
    url: `https://example.com/report/${index}`,
    observation: "x".repeat(1200),
  }));
  const manyOpportunities = Array.from({ length: 20 }, (_, index) => opportunity({
    id: `opportunity-${index}`,
    evidenceItems: largeEvidence.map((item) => ({ ...item, id: `${item.id}-${index}`, url: `${item.url}?opportunity=${index}` })),
  }));
  assert.throws(() => createOpportunityBackup(manyOpportunities), /exceed 2 MB/i);
});

test("rejects oversized evidence text instead of trimming or silently losing it", () => {
  const tooLongEvidence = { ...evidence, observation: "x".repeat(1201) };
  assert.throws(() => parseOpportunityBackup(encoded([opportunity({ evidenceItems: [tooLongEvidence] })])), /invalid opportunity or evidence data/i);
});

test("rejects inconsistent counts rather than silently dropping data", () => {
  assert.throws(() => parseOpportunityBackup(encoded([opportunity()], { evidenceCount: 0 })), /counts do not match/i);
});

test("refuses to export invalid records or duplicate identifiers", () => {
  assert.throws(() => createOpportunityBackup([opportunity({ title: "" })]), /invalid data/i);
  assert.throws(() => createOpportunityBackup([opportunity(), opportunity()]), /duplicate opportunity IDs/i);
});

test("merge imports only new IDs and never overwrites a matching local record", () => {
  const local = opportunity({
    id: "opportunity-1",
    title: "Keep the local record",
    evidenceItems: [],
  });
  const collidingImport = opportunity({
    id: "opportunity-1",
    title: "Do not replace this local record",
  });
  const newImport = opportunity({
    id: "opportunity-2",
    title: "Imported new opportunity",
  });
  const backup = parseOpportunityBackup(encoded([collidingImport, newImport]));
  const localBefore = structuredClone(local);

  const merged = mergeOpportunityBackup([local], backup);

  assert.deepEqual(merged.opportunities, [newImport, local]);
  assert.equal(merged.addedCount, 1);
  assert.equal(merged.skippedCount, 1);
  assert.equal(merged.evidenceCount, 1);
  assert.deepEqual(local, localBefore);
});

test("merge leaves local data unchanged when every imported ID already exists", () => {
  const local = opportunity({
    id: "opportunity-1",
    title: "Authoritative local title",
  });
  const backup = parseOpportunityBackup(encoded([
    opportunity({ id: "opportunity-1", title: "Stale imported title" }),
  ]));
  const current = [local];
  const before = structuredClone(current);

  const merged = mergeOpportunityBackup(current, backup);

  assert.deepEqual(merged.opportunities, before);
  assert.equal(merged.addedCount, 0);
  assert.equal(merged.skippedCount, 1);
  assert.equal(merged.evidenceCount, 0);
});

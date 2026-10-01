import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { nextActionFor, planHealthFor } from "../lib/mission-intelligence.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const migrationFiles = readdirSync(join(repoRoot, "supabase", "migrations"))
  .filter((name) => /_w20_cancelled_action_completion_semantics\.sql$/.test(name));
assert.equal(migrationFiles.length, 1, "expected exactly one W20 completion migration");
const migration = readFileSync(join(repoRoot, "supabase", "migrations", migrationFiles[0]), "utf8");
const now = new Date("2026-09-30T12:00:00.000Z");
const action = (title, status, followUpAt = null) => ({ id: title, title, status, followUpAt });
const mission = (overrides = {}) => ({
  id: "m1",
  name: "Renew passport",
  lifecycleStatus: "RUNNING",
  actions: [],
  verifications: [],
  outcomes: [],
  ...overrides,
});

test("next action reports no actions as a concrete planning blocker", () => {
  const result = nextActionFor(mission(), now);
  assert.equal(result.nextAction, "Add an action");
  assert.equal(result.blockingCondition, "No actions define the work required.");
  assert.equal(result.priority, "high");
});

test("next action follows persisted action order for pending work", () => {
  const result = nextActionFor(mission({ actions: [action("Collect documents", "PENDING"), action("Book appointment", "PENDING")] }), now);
  assert.equal(result.nextAction, "Start: Collect documents");
  assert.equal(result.actionId, "Collect documents");
});

test("running work is reported as the next action without inventing a new task", () => {
  const result = nextActionFor(mission({ actions: [action("Submit form", "RUNNING")] }), now);
  assert.equal(result.nextAction, "Continue: Submit form");
  assert.equal(result.blockingCondition, null);
});

test("future waiting follow-up is distinct from overdue waiting follow-up", () => {
  const future = nextActionFor(mission({ actions: [action("Hear back from office", "BLOCKED", "2026-10-03T09:00:00.000Z")] }), now);
  assert.equal(future.nextAction, "Resolve waiting: Hear back from office");
  assert.match(future.reason, /waiting until/i);

  const overdue = nextActionFor(mission({ actions: [action("Hear back from office", "BLOCKED", "2026-09-28T09:00:00.000Z")] }), now);
  assert.equal(overdue.nextAction, "Follow up: Hear back from office");
  assert.match(overdue.blockingCondition, /overdue/i);
});

test("cancelled work is not selected as next work and does not create a health blocker", () => {
  const m = mission({ actions: [action("Old appointment", "CANCELLED")] });
  const next = nextActionFor(m, now);
  assert.equal(next.nextAction, "Ready to check");
  assert.equal(planHealthFor(m, now).findings.length, 1);
  assert.equal(planHealthFor(m, now).findings[0].code, "APPEARS_COMPLETE");
});

test("all unresolved blocked actions are reported by plan health", () => {
  const health = planHealthFor(mission({ actions: [action("Wait for signature", "BLOCKED")] }), now);
  assert.equal(health.healthy, false);
  assert.ok(health.findings.some((finding) => finding.code === "ALL_REMAINING_BLOCKED"));
});

test("verification and outcome readiness are derived from persisted lifecycle data", () => {
  const verifying = nextActionFor(mission({
    lifecycleStatus: "VERIFYING",
    actions: [action("Submit form", "COMPLETED")],
  }), now);
  assert.equal(verifying.nextAction, "Record verification");

  const outcome = nextActionFor(mission({
    lifecycleStatus: "VERIFYING",
    actions: [action("Submit form", "COMPLETED")],
    verifications: [{ id: "v1" }],
  }), now);
  assert.equal(outcome.nextAction, "Record outcome");
  assert.ok(planHealthFor({ ...mission({ lifecycleStatus: "VERIFYING", actions: [action("Submit form", "COMPLETED")], verifications: [{ id: "v1" }] }), outcomes: [] }, now)
    .findings.some((finding) => finding.code === "OUTCOME_MISSING"));
});

test("completed, failed and cancelled missions do not invent further work", () => {
  for (const lifecycleStatus of ["COMPLETED", "FAILED", "CANCELLED"]) {
    const result = nextActionFor(mission({ lifecycleStatus, actions: [action("Done", "COMPLETED")] }), now);
    assert.equal(result.blockingCondition, null);
    assert.equal(result.priority, "normal");
  }
});

test("the completion migration excludes cancelled actions but keeps the authoritative guards", () => {
  assert.match(migration, /status not in \('COMPLETED', 'CANCELLED'\)/);
  assert.match(migration, /auth\.uid\(\) is null[\s\S]*?AUTHENTICATION_REQUIRED/);
  assert.match(migration, /v_mission\.owner_id <> auth\.uid\(\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(migration, /VERIFICATION_NOT_VERIFIED/);
  assert.match(migration, /MISSION_NOT_VERIFYING/);
  assert.match(migration, /record_mission_event/);
  assert.match(migration, /CANCELLED/);
  assert.doesNotMatch(migration, /service_role/);
});

test("the mission detail exposes deterministic guidance and plan health", () => {
  const page = readFileSync(join(webRoot, "app", "app", "missions", "[id]", "page.tsx"), "utf8");
  assert.match(page, /missionIntelligenceFor\(mission\)/);
  assert.match(page, /What should I do next\?/);
  assert.match(page, /Plan health/);
});

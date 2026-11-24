import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceFromProof, hasProof, normaliseProof, proofCitation, proofLinkLabel } from "../lib/step-proof.mjs";
import { composeMissionObjective, humaniseEventType, mergeCriteria, parseMissionObjective, verificationReadiness } from "../lib/mission-content.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Proof on a step: optional note and link, cleaned before it is stored.
// ---------------------------------------------------------------------------

test("proof is optional: nothing typed stores nothing", () => {
  assert.deepEqual(normaliseProof({}), { ok: true, note: null, url: null });
  assert.deepEqual(normaliseProof({ note: "   ", url: "  " }), { ok: true, note: null, url: null });
});

test("a bare domain becomes an https link, a full link is kept", () => {
  assert.equal(normaliseProof({ url: "example.com/receipt" }).url, "https://example.com/receipt");
  assert.equal(normaliseProof({ url: " https://skatteetaten.no/kvittering?id=4 " }).url, "https://skatteetaten.no/kvittering?id=4");
  assert.equal(normaliseProof({ url: "http://localhost.example.org" }).url, "http://localhost.example.org");
});

test("links the database would refuse are refused first, in words", () => {
  for (const url of ["javascript:alert(1)", "ftp://files.example.com/a", "not a link", "receipt", "mailto:a@b.co"]) {
    const result = normaliseProof({ url });
    assert.equal(result.ok, false, url);
    assert.match(result.error, /link/i, url);
  }
  assert.equal(normaliseProof({ url: `https://example.com/${"a".repeat(2100)}` }).ok, false);
});

test("the note is trimmed and capped at the database limit", () => {
  assert.equal(normaliseProof({ note: "  Paid, confirmation 4471 " }).note, "Paid, confirmation 4471");
  assert.equal(normaliseProof({ note: "x".repeat(1001) }).ok, false);
  assert.equal(normaliseProof({ note: 42 }).ok, false);
});

test("proof feeds the evidence summary without claiming more than was recorded", () => {
  const actions = [
    { title: "Pay the fee", status: "COMPLETED", evidenceNote: "Paid, ref 4471", evidenceUrl: "https://pay.example.com/r/1" },
    { title: "Book the slot", status: "COMPLETED", evidenceNote: null, evidenceUrl: null },
    { title: "Collect the card", status: "PENDING", evidenceNote: "draft", evidenceUrl: null },
  ];
  assert.equal(evidenceFromProof(actions), "- Pay the fee: Paid, ref 4471 https://pay.example.com/r/1");
  assert.equal(proofCitation(actions[1]), "- Book the slot");
  assert.equal(hasProof(actions[1]), false);
  assert.equal(proofLinkLabel("https://www.stripe.com/receipts/x"), "stripe.com");
});

// ---------------------------------------------------------------------------
// AI plan criteria are merged, not duplicated.
// ---------------------------------------------------------------------------

test("plan criteria are added once, ignoring case, spacing and a final full stop", () => {
  const merged = mergeCriteria(["Site is live"], ["site is live.", "  First order  received ", "First order received", 7]);
  assert.deepEqual(merged.added, ["First order received"]);
  assert.deepEqual(merged.criteria, ["Site is live", "First order received"]);
  assert.deepEqual(mergeCriteria(merged.criteria, ["Site is live"]).added, []);
  assert.equal(mergeCriteria([], Array.from({ length: 30 }, (_, i) => `c${i}`), 12).criteria.length, 12);
});

test("Add these steps sends the whole plan, criteria included, in one request", () => {
  const plan = read("components/ai-mission-plan.tsx");
  assert.match(plan, /titles: plan\.steps\.map/);
  assert.match(plan, /criteria: plan\.successCriteria/);
  assert.doesNotMatch(plan, /for \(const item of plan\.steps\)/, "one request per step was slow");
  const route = read("app/api/missions/[id]/actions/route.ts");
  assert.match(route, /addActions!/);
  assert.match(route, /mergeCriteria\(mission\.criteria, incoming\)/);
  assert.match(route, /expectedVersion: mission\.version/);
});

// ---------------------------------------------------------------------------
// The mission follows its steps.
// ---------------------------------------------------------------------------

test("the migration is additive and routes every move through transition_mission", () => {
  const sql = read("../../supabase/migrations/20261123190000_step_proof_and_auto_lifecycle.sql");
  assert.doesNotMatch(sql, /drop (table|column|function)/i);
  assert.match(sql, /add column if not exists evidence_note text/);
  assert.match(sql, /add column if not exists evidence_url text/);
  for (const fn of ["complete_mission_action", "set_mission_action_proof", "advance_mission_lifecycle"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(sql, new RegExp(`revoke all on function (private|public)\\.${fn}\\([^)]*\\) from public, anon`));
  }
  // No direct status writes on missions: the transition table stays the one authority.
  assert.doesNotMatch(sql, /update public\.missions/);
  assert.match(sql, /private\.transition_mission\(/);
  // It never sends a mission to Checking on its own when a step is done.
  assert.match(sql, /advance_mission_lifecycle\(v_action\.mission_id, 'RUNNING'\)/);
});

test("done, start, verification and outcome all let the mission follow", () => {
  const repo = read("lib/supabase/mission-repository.ts");
  assert.match(repo, /rpc\("complete_mission_action"/);
  assert.match(repo, /input\.status === "RUNNING" && input\.missionId\) await advanceLifecycle\(input\.missionId, "RUNNING"\)/);
  const verification = repo.slice(repo.indexOf("async recordVerification"));
  assert.match(verification.slice(0, 600), /advanceLifecycle\(input\.missionId, "VERIFYING"\)/);
  const outcome = repo.slice(repo.indexOf("async commitOutcome"));
  assert.match(outcome.slice(0, 600), /advanceLifecycle\(input\.missionId, "VERIFYING"\)/);
  const route = read("app/api/missions/[id]/actions/[actionId]/route.ts");
  const done = route.slice(route.indexOf('if (body.status === "COMPLETED")'));
  assert.match(done.slice(0, 800), /completeAction!/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /normaliseProof/);
});

test("a step is marked done in one tap, with proof optional and shown afterwards", () => {
  const controls = read("components/action-mutation-controls.tsx");
  assert.match(controls, /t\("Mark done"\)/);
  assert.match(controls, /status: "COMPLETED", evidenceNote: note, evidenceUrl: link/);
  assert.match(controls, /value !== "COMPLETED"/, "done has its own button, not a second path in the menu");
  assert.match(controls, /rel="noopener noreferrer nofollow ugc"/);
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /stepProof=\{stepProof\}/);
  assert.match(page, /initialEvidence=\{initialEvidence\}/);
  assert.match(page, /StatusPill status=\{mission\.status\} label=\{missionStatusLabel\(mission\.lifecycleStatus, t\)\}/);
  assert.doesNotMatch(page, /Use “Edit this mission” above to move it/);
});

test("the history names a proof edit in words", () => {
  assert.equal(humaniseEventType("ACTION_PROOF_RECORDED"), "Proof added to a step");
});

// ---------------------------------------------------------------------------
// Live check, 24 Nov: what the activity list and the evidence line showed.
// ---------------------------------------------------------------------------
import { collapseLifecycleChains, eventDetail } from "../lib/mission-content.mjs";

test("one automatic walk reads as one line, above the step that caused it", () => {
  const time = "2026-11-23T18:37:00Z";
  const activity = [
    { label: "Step status changed", fromStatus: "PENDING", toStatus: "COMPLETED", time, detail: "" },
    { label: "Mission status changed", fromStatus: "PLANNING", toStatus: "READY", time, detail: "" },
    { label: "Mission status changed", fromStatus: "DRAFT", toStatus: "PLANNING", time, detail: "" },
    { label: "Mission status changed", fromStatus: "READY", toStatus: "RUNNING", time, detail: "" },
    { label: "Step status changed", fromStatus: "RUNNING", toStatus: "COMPLETED", time: "2026-11-23T17:42:00Z", detail: "" },
  ];
  const collapsed = collapseLifecycleChains(activity);
  assert.equal(collapsed.length, 3);
  assert.deepEqual([collapsed[0].label, collapsed[0].fromStatus, collapsed[0].toStatus], ["Mission status changed", "DRAFT", "RUNNING"]);
  assert.equal(collapsed[1].label, "Step status changed");
  // A single manual move is left as it is.
  const single = [{ label: "Mission status changed", fromStatus: "RUNNING", toStatus: "PAUSED", time, detail: "" }];
  assert.deepEqual(collapseLifecycleChains(single), single);
});

test("verification and outcome events say what happened in words, not codes", () => {
  assert.equal(eventDetail("VERIFICATION_RECORDED", { status: "VERIFIED" }), "Verified");
  assert.equal(eventDetail("OUTCOME_COMMITTED", { status: "COMPLETED" }), "Complete");
  assert.equal(eventDetail("OUTCOME_COMMITTED", { status: "FAILED" }), "Did not succeed");
  assert.equal(eventDetail("MISSION_OBJECTIVE_UPDATED", { objective: "x".repeat(500) }), "");
  assert.equal(humaniseEventType("VERIFICATION_RECORDED"), "Verification recorded");
  assert.equal(humaniseEventType("MISSION_OBJECTIVE_UPDATED"), "Mission details edited");
});

test("an evidence line does not end the step title with a stop before the colon", () => {
  assert.equal(proofCitation({ title: "Check the rules.", evidenceNote: "Read the page", evidenceUrl: null }), "- Check the rules: Read the page");
  assert.equal(proofCitation({ title: "تحقّق من المتطلبات.", evidenceNote: "قرأت الصفحة", evidenceUrl: null }), "- تحقّق من المتطلبات: قرأت الصفحة");
});

test("a saved step closes its form at once and is not shown as an error", () => {
  const controls = read("components/action-mutation-controls.tsx");
  assert.match(controls, /setProofOpen\(false\);\s*setSaved\(true\);/);
  assert.match(controls, /className="action-saved" role="status"/);
});

test("a mission without criteria does not show an empty heading in its intent", () => {
  const stored = "Test: first month\n\nSort out the basics after the move.\n\nSuccess criteria:";
  assert.deepEqual(parseMissionObjective(stored), { name: "Test: first month", intent: "Sort out the basics after the move.", criteria: [] });
  const composed = composeMissionObjective({ name: "N", intent: "Intent text", criteria: [] });
  assert.doesNotMatch(composed, /Success criteria/);
  assert.deepEqual(parseMissionObjective(composeMissionObjective({ name: "N", intent: "Intent text", criteria: ["A", "B"] })).criteria, ["A", "B"]);
});

test("an empty mission does not offer verification; it asks for the work first", () => {
  const readiness = verificationReadiness({ lifecycleStatus: "DRAFT", actions: [] });
  assert.equal(readiness.ready, false);
  assert.match(readiness.reason, /add the work first/i);
});

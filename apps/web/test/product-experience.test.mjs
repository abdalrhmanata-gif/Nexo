import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  allowedNextMissionStatuses,
  composeMissionObjective,
  isMissionTransitionAllowed,
  isTerminalMissionStatus,
  missionStatusLabel,
  nextStepFor,
  parseMissionObjective,
  routeToVerifying,
  verificationReadiness,
} from "../lib/mission-content.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const read = (relative) => readFileSync(join(webRoot, relative), "utf8");

const migrationsDir = join(repoRoot, "supabase", "migrations");
const lifecycleFiles = readdirSync(migrationsDir).filter((name) => /_w8_lifecycle_integrity_provenance\.sql$/.test(name));
assert.equal(lifecycleFiles.length, 1, "expected exactly one W8 lifecycle migration");
const lifecycleMigration = readFileSync(join(migrationsDir, lifecycleFiles[0]), "utf8");

// ---------------------------------------------------------------------------
// W19 defect 1 — editing a mission destroyed its name and success criteria.
// ---------------------------------------------------------------------------

test("editing a mission preserves its name and success criteria", () => {
  const original = composeMissionObjective({
    name: "Renew my passport",
    intent: "Replace the passport before the trip in March.",
    criteria: ["New passport in hand", "Old passport returned"],
  });
  const parsed = parseMissionObjective(original);
  assert.equal(parsed.name, "Renew my passport");
  assert.equal(parsed.criteria.length, 2);

  // What the edit form now submits: every part recomposed, not just intent.
  const edited = composeMissionObjective({
    name: parsed.name,
    intent: "Replace the passport before the trip in April.",
    criteria: parsed.criteria,
  });
  const reparsed = parseMissionObjective(edited);
  assert.equal(reparsed.name, "Renew my passport");
  assert.deepEqual(reparsed.criteria, ["New passport in hand", "Old passport returned"]);
  assert.match(reparsed.intent, /April/);
});

test("the mission edit form submits all three parts, never a bare intent", () => {
  const source = read("components/mission-mutation-controls.tsx");
  assert.match(source, /composeMissionObjective\(\{ name: nextName, intent: nextIntent, criteria: nextCriteria \}\)/);
  assert.match(source, /name="name"/);
  assert.match(source, /name="criteria"/);
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /criteria=\{mission\.criteria\}/);
  assert.doesNotMatch(page, /objective=\{mission\.intent\}/);
});

test("composing an objective accepts criteria as lines or as text", () => {
  const fromArray = composeMissionObjective({ name: "N", intent: "I", criteria: ["a", "b"] });
  const fromText = composeMissionObjective({ name: "N", intent: "I", criteria: "a\nb" });
  assert.equal(fromArray, fromText);
  assert.deepEqual(parseMissionObjective(fromArray).criteria, ["a", "b"]);
});

// ---------------------------------------------------------------------------
// W19 defect 2 — the mission lifecycle was exposed as raw enums, including
// transitions the database always rejects.
// ---------------------------------------------------------------------------

test("the mission transition mirror matches the database exactly", () => {
  const table = lifecycleMigration.slice(
    lifecycleMigration.indexOf("('DRAFT', 'PLANNING')"),
    lifecycleMigration.indexOf("as allowed(from_status, to_status)"),
  );
  const pairs = [...table.matchAll(/\('([A-Z_]+)',\s*'([A-Z_]+)'\)/g)].map(([, from, to]) => `${from}->${to}`);
  assert.ok(pairs.length >= 30, `expected the full transition table, found ${pairs.length}`);

  const mirrored = [];
  for (const from of ["DRAFT", "PLANNING", "READY", "RUNNING", "WAITING", "NEEDS_USER", "VERIFYING", "PAUSED", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED"]) {
    for (const to of allowedNextMissionStatuses(from)) mirrored.push(`${from}->${to}`);
  }
  assert.deepEqual([...mirrored].sort(), [...pairs].sort());
});

test("terminal mission states offer no transitions, unknown states are not terminal", () => {
  for (const status of ["COMPLETED", "FAILED", "CANCELLED"]) {
    assert.equal(isTerminalMissionStatus(status), true);
    assert.deepEqual(allowedNextMissionStatuses(status), []);
  }
  // A missing lifecycle must never be read as a closed mission.
  assert.equal(isTerminalMissionStatus(undefined), false);
  assert.equal(isTerminalMissionStatus("NOT_A_STATE"), false);
});

test("illegal mission transitions are never offered", () => {
  assert.equal(isMissionTransitionAllowed("DRAFT", "VERIFYING"), false);
  assert.equal(isMissionTransitionAllowed("DRAFT", "COMPLETED"), false);
  assert.equal(isMissionTransitionAllowed("RUNNING", "VERIFYING"), true);
  assert.equal(isMissionTransitionAllowed("VERIFYING", "COMPLETED"), true);
  assert.equal(isMissionTransitionAllowed("COMPLETED", "RUNNING"), false);
});

test("every mission state has a human label rather than a raw enum", () => {
  for (const status of ["DRAFT", "PLANNING", "READY", "RUNNING", "WAITING", "NEEDS_USER", "VERIFYING", "COMPLETED", "PAUSED", "BLOCKED", "FAILED", "CANCELLED"]) {
    const label = missionStatusLabel(status);
    assert.ok(label && label !== status, `${status} still renders as a raw enum`);
    assert.doesNotMatch(label, /_/);
  }
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /missionStatusLabel\(mission\.lifecycleStatus\)/);
  // The raw value may still be passed as a prop; it must never be rendered.
  assert.doesNotMatch(page, /<br \/>\{mission\.lifecycleStatus\}/);
});

// ---------------------------------------------------------------------------
// W19 defect 3 — verification and outcome forms were shown when the database
// was certain to reject them.
// ---------------------------------------------------------------------------

test("a new mission is told how to reach the state where evidence is accepted", () => {
  const readiness = verificationReadiness({ lifecycleStatus: "DRAFT", actions: [] });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.nextStatus, "PLANNING");
  assert.match(readiness.reason, /checking the evidence/i);
  assert.doesNotMatch(readiness.reason, /VERIFYING/);
});

test("the route to the verifying state is the one the database allows", () => {
  assert.deepEqual(routeToVerifying("VERIFYING"), []);
  assert.deepEqual(routeToVerifying("DRAFT"), ["PLANNING", "READY", "RUNNING", "VERIFYING"]);
  assert.deepEqual(routeToVerifying("RUNNING"), ["VERIFYING"]);
  for (const step of routeToVerifying("DRAFT")) assert.ok(step);
  assert.equal(routeToVerifying("COMPLETED"), null);
});

test("verification is offered only while the mission is being checked", () => {
  assert.equal(verificationReadiness({ lifecycleStatus: "VERIFYING", actions: [] }).ready, true);
  for (const status of ["DRAFT", "PLANNING", "READY", "RUNNING", "WAITING", "PAUSED"]) {
    assert.equal(verificationReadiness({ lifecycleStatus: status, actions: [] }).ready, false, `${status} must not offer verification`);
  }
});

test("a closed mission is told no further evidence can be recorded", () => {
  const readiness = verificationReadiness({ lifecycleStatus: "COMPLETED", actions: [] });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.nextStatus, null);
  assert.match(readiness.reason, /no further evidence/i);
});

test("unresolved actions are named so the blocker is visible", () => {
  const readiness = verificationReadiness({
    lifecycleStatus: "RUNNING",
    actions: [
      { title: "Book appointment", status: "COMPLETED" },
      { title: "Collect documents", status: "PENDING" },
      { title: "Pay the fee", status: "BLOCKED" },
      { title: "Abandoned step", status: "CANCELLED" },
    ],
  });
  assert.deepEqual(readiness.unresolved.map((action) => action.title), ["Collect documents", "Pay the fee"]);
});

test("the detail page gates the verification form on readiness", () => {
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /verificationReadiness\(mission\)/);
  assert.match(page, /readiness\.ready[\s\S]{0,400}VerificationControls/);
});

// ---------------------------------------------------------------------------
// W19 defect 4 — the next step claimed verification was due on missions that
// were already finished, because the workspace list loads no history.
// ---------------------------------------------------------------------------

test("a completed mission is never asked to record verification again", () => {
  // Exactly what listMissions produces: actions, but no verification history.
  const listed = { lifecycleStatus: "COMPLETED", actions: [{ status: "COMPLETED", title: "Done" }], verifications: [], outcomes: [] };
  const step = nextStepFor(listed);
  assert.equal(step.tone, "done");
  assert.doesNotMatch(step.label, /record verification/i);
});

test("closed missions report closure rather than pending work", () => {
  for (const status of ["FAILED", "CANCELLED"]) {
    const step = nextStepFor({ lifecycleStatus: status, actions: [{ status: "PENDING", title: "Never started" }], verifications: [], outcomes: [] });
    assert.equal(step.tone, "done");
    assert.match(step.detail, /closed/i);
  }
});

test("an in-flight mission with resolved actions is told to move, not to verify", () => {
  const step = nextStepFor({ lifecycleStatus: "RUNNING", actions: [{ status: "COMPLETED", title: "Done" }], verifications: [], outcomes: [] });
  assert.equal(step.tone, "attention");
  assert.match(step.detail, /checking the evidence/i);
});

// ---------------------------------------------------------------------------
// W19 defect 5 — a plan could not change: actions were fixed at creation.
// ---------------------------------------------------------------------------

test("actions can be added to an existing mission through the server boundary", () => {
  const route = read("app/api/missions/[id]/actions/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /createSupabaseMissionRepository/);
  assert.match(route, /repository\.addAction/);
  // Ownership must never be accepted from the request body.
  assert.doesNotMatch(route, /\b(owner_id|user_id)\b/);
  assert.doesNotMatch(route, new RegExp(["service", "_role"].join("")));
});

test("adding an action rejects empty and oversized titles", () => {
  const route = read("app/api/missions/[id]/actions/route.ts");
  assert.match(route, /if \(!title\)/);
  assert.match(route, /title\.length > MAX_TITLE/);
  assert.match(route, /status: 400/);
});

test("the repository scopes a new action to a mission the session owns", () => {
  const repository = read("lib/supabase/mission-repository.ts");
  const addAction = repository.slice(repository.indexOf("async addAction("), repository.indexOf("async updateAction("));
  assert.match(addAction, /from\("missions"\)[\s\S]*\.eq\("workspace_id", workspaceId\)/);
  assert.match(addAction, /position/);
  assert.doesNotMatch(addAction, new RegExp(["service", "_role"].join("")));
});

test("the mission detail page exposes the add-action control", () => {
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /AddActionForm missionId=\{mission\.id\}/);
  assert.match(page, /repository\.addAction &&/);
});

// ---------------------------------------------------------------------------
// W19 defect 6 — raw database labels were returned to the user.
// ---------------------------------------------------------------------------

test("verification and outcome failures are mapped to readable messages", () => {
  const repository = read("lib/supabase/mission-repository.ts");
  for (const label of ["MISSION_NOT_VERIFYING", "ALL_ACTIONS_MUST_BE_COMPLETED", "VERIFICATION_NOT_VERIFIED", "INVALID_OUTCOME_SCORE"]) {
    assert.ok(repository.includes(`${label}:`), `${label} has no human message`);
  }
  // Both paths must run through the mapper, not throw the raw error.
  const verification = repository.slice(repository.indexOf("async recordVerification("), repository.indexOf("async commitOutcome("));
  assert.match(verification, /throwMutationError\(result\.error\)/);
  const outcome = repository.slice(repository.indexOf("async commitOutcome("));
  assert.match(outcome, /throwMutationError\(result\.error\)/);
});

test("the verification and outcome routes never echo a raw database label", () => {
  for (const file of ["app/api/missions/[id]/verification/route.ts", "app/api/missions/[id]/outcome/route.ts"]) {
    const route = read(file);
    assert.match(route, /MissionMutationRejectedError/);
    assert.match(route, /status: 422/);
    // The old handler returned `error.message` straight from Postgres.
    assert.doesNotMatch(route, /error: message/);
  }
});

// ---------------------------------------------------------------------------
// W19 defect 7 — navigation and mission setup.
// ---------------------------------------------------------------------------

test("the workspace stays reachable on a small screen", () => {
  const css = read("app/globals.css");
  assert.doesNotMatch(css, /\.topbar nav a:not\(\.button\) \{ display:none; \}/);
  const newMission = read("app/app/missions/new/page.tsx");
  assert.match(newMission, /href="\/app"/);
});

test("one-goal-first mission creation keeps review fields after the AI draft", () => {
  const source = read("components/mission-create-form.tsx");
  assert.match(source, /name="criteria"/);
  assert.match(source, /name="actions"/);
  assert.match(source, /Build my plan/);
  assert.match(source, /Want more control\? Add details/);
  assert.match(source, /setDrafted\(true\)/);
  assert.match(source, /setCriteria\(plan\.summary\)/);
  assert.match(source, /setActions\(plan\.steps\.map/);
  // Omitting the steps must keep the pre-W19 behaviour of seeding from criteria.
  const page = read("app/app/missions/new/page.tsx");
  assert.match(page, /steps \? toLines\(steps\) : toLines\(criteria\)/);
  assert.doesNotMatch(page, /becomes both a success criterion and an action/);
});


test("homepage presents the final launch pricing tiers and quotas", () => {
  const page = read("app/page.tsx");
  for (const value of ["$0", "$9", "$25", "5", "50", "300", "Free", "Plus", "Pro"]) {
    assert.ok(page.includes(value), `homepage pricing is missing ${value}`);
  }
  assert.ok(page.includes("Billing is not enabled yet"));
});

test("homepage communicates the one-goal-first product loop", () => {
  const page = read("app/page.tsx");
  assert.match(page, /From thought to mission/);
  assert.match(page, /You explain it\. ZAVQERA structures it\./);
  assert.match(page, /A clear mission and intent/);
  assert.match(page, /Success criteria/);
  assert.match(page, /Practical first steps/);
  assert.match(page, /Nothing is created or executed until you decide/);
});

\ntest("AI mission entry removes the blank-page moment with starter goals", () => {
  const source = read("components/mission-create-form.tsx");
  assert.match(source, /Try an example/);
  assert.match(source, /Launch a small online shop in six weeks/);
  assert.match(source, /Get my visa application ready/);
  assert.match(source, /Organize a side project alongside my job/);
  assert.match(source, /Describe the result, not the project structure/);
  assert.match(source, /setError\("?"\)/);
});


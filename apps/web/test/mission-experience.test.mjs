import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  ACTION_STATUS_ORDER,
  actionStatusHint,
  actionStatusLabel,
  composeMissionObjective,
  humaniseEventType,
  nextStepFor,
  parseMissionObjective,
  summariseEventPayload,
} from "../lib/mission-content.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(webRoot, relative), "utf8");

test("a composed objective round-trips back into its parts", () => {
  const parts = { name: "Ship onboarding", intent: "New users reach their first mission without help.", criteria: "Sign-up works\nFirst mission created" };
  const parsed = parseMissionObjective(composeMissionObjective(parts));
  assert.equal(parsed.name, parts.name);
  assert.equal(parsed.intent, parts.intent);
  assert.deepEqual(parsed.criteria, ["Sign-up works", "First mission created"]);
});

test("the parsed intent never repeats the title or the criteria marker", () => {
  const parsed = parseMissionObjective(composeMissionObjective({ name: "Ship onboarding", intent: "Reduce time to first mission.", criteria: "Sign-up works" }));
  assert.ok(!parsed.intent.includes("Ship onboarding"));
  assert.ok(!parsed.intent.includes("Success criteria"));
});

test("free-form and legacy objectives still yield a usable title", () => {
  assert.equal(parseMissionObjective("Just one line").name, "Just one line");
  assert.deepEqual(parseMissionObjective("Just one line").criteria, []);
  assert.equal(parseMissionObjective("").name, "Untitled mission");
  assert.equal(parseMissionObjective(undefined).name, "Untitled mission");
});

test("blank criteria lines are discarded rather than rendered as empty rows", () => {
  const parsed = parseMissionObjective(composeMissionObjective({ name: "N", intent: "I", criteria: "One\n\n  \nTwo\n" }));
  assert.deepEqual(parsed.criteria, ["One", "Two"]);
});

test("every action status has a human label and a hint", () => {
  for (const status of ACTION_STATUS_ORDER) {
    assert.notEqual(actionStatusLabel(status), status, `${status} must not be shown raw`);
    assert.ok(actionStatusHint(status).length > 0, `${status} needs a hint`);
  }
});

test("waiting is explicitly distinguished from complete", () => {
  assert.equal(actionStatusLabel("BLOCKED"), "Waiting");
  assert.match(actionStatusHint("BLOCKED"), /not complete/i);
  assert.equal(actionStatusLabel("COMPLETED"), "Complete");
});

test("the next step reflects real mission state for every branch", () => {
  const base = { actions: [], verifications: [], outcomes: [] };
  assert.match(nextStepFor(base).label, /No actions yet/);
  assert.equal(nextStepFor({ ...base, actions: [{ status: "PENDING", title: "Draft copy" }] }).detail, "Draft copy");
  assert.equal(nextStepFor({ ...base, actions: [{ status: "BLOCKED", title: "Await legal" }] }).tone, "attention");
  assert.equal(nextStepFor({ ...base, actions: [{ status: "BLOCKED", title: "Await legal" }, { status: "RUNNING", title: "Write spec" }] }).detail, "Write spec");
  assert.match(nextStepFor({ ...base, actions: [{ status: "COMPLETED", title: "Done" }] }).label, /ready to check/i);
  assert.match(nextStepFor({ ...base, lifecycleStatus: "VERIFYING", actions: [{ status: "COMPLETED", title: "Done" }] }).label, /verification/i);
  assert.match(nextStepFor({ ...base, lifecycleStatus: "VERIFYING", actions: [{ status: "COMPLETED", title: "Done" }], verifications: [{ id: "v1", status: "VERIFIED" }] }).label, /outcome/i);
  assert.equal(nextStepFor({ ...base, verifications: [{ id: "v1" }], outcomes: [{ id: "o1" }] }).tone, "done");
});

test("workspace guidance distinguishes a failed verification from a passing one", () => {
  const base = { lifecycleStatus: "VERIFYING", actions: [{ status: "COMPLETED", title: "Done" }], outcomes: [] };
  assert.equal(nextStepFor({ ...base, verifications: [{ status: "FAILED" }] }).label, "Record verification");
  assert.match(nextStepFor({ ...base, verifications: [{ status: "VERIFIED" }] }).label, /outcome/i);
  assert.equal(nextStepFor({ ...base, verifications: [{ status: "VERIFIED" }], actions: [{ status: "PENDING", title: "Required" }] }).label, "Start next action");
});

test("workspace guidance selects available work before a future follow-up", () => {
  const future = new Date(Date.now() + 86400000 * 2).toISOString();
  const result = nextStepFor({ lifecycleStatus: "RUNNING", actions: [
    { status: "BLOCKED", title: "Later", followUpAt: future },
    { status: "PENDING", title: "Now" },
  ] });
  assert.equal(result.label, "Start next action");
  assert.equal(result.detail, "Now");
});

test("activity summaries never leak a raw payload dump", () => {
  const summary = summariseEventPayload({ from_status: "PENDING", to_status: "RUNNING", secret_token: "abc123", owner_id: "u-1" });
  assert.ok(!summary.includes("abc123"));
  assert.ok(!summary.includes("owner_id"));
  assert.ok(!summary.includes("{"));
  assert.match(summary, /PENDING to RUNNING/);
  assert.equal(summariseEventPayload(null), "Mission history event");
  assert.equal(summariseEventPayload({ internal: { nested: true } }), "Mission history event");
  assert.ok(summariseEventPayload({ title: "x".repeat(400) }).length <= 160);
});

test("event types are humanised rather than shown as raw enums", () => {
  assert.equal(humaniseEventType("MISSION_CREATED"), "Mission created");
  assert.equal(humaniseEventType(""), "Mission event");
});

test("the repository no longer fabricates risk or budget data", () => {
  const repository = read("lib/supabase/mission-repository.ts");
  assert.ok(!/risk\s*:/.test(repository), "risk must not be invented");
  assert.ok(!/budget\s*:/.test(repository), "budget must not be invented");
  assert.ok(!/JSON\.stringify\(\s*(row\.)?payload/.test(repository), "payloads must be summarised, not dumped");
  assert.ok(!/MissionRisk/.test(read("lib/view-models.ts")));
});

test("mission lists are fetched without an action query per mission", () => {
  const repository = read("lib/supabase/mission-repository.ts");
  const listMissions = repository.slice(repository.indexOf("async listMissions"), repository.indexOf("async getMission"));
  assert.ok(listMissions.includes('.in("mission_id"'), "actions must be batch-fetched");
  assert.ok(!listMissions.includes("completeMission("), "no per-mission hydration");
});

test("the creation form and the parser share one objective format", () => {
  const form = read("app/app/missions/new/page.tsx");
  assert.ok(form.includes("composeMissionObjective"), "the form must not hand-build the stored format");
  assert.ok(!form.includes("Success criteria:\\n"), "the format must have a single owner");
});

test("action status controls present human labels", () => {
  const controls = read("components/action-mutation-controls.tsx");
  assert.ok(controls.includes("actionStatusLabel"));
  assert.ok(!/<option key=\{status\} value=\{status\}>\{status\}</.test(controls), "raw enum values must not be rendered");
});

test("the mission detail page surfaces success criteria and honest verification wording", () => {
  const detail = read("app/app/missions/[id]/page.tsx");
  assert.ok(detail.includes("Success criteria"));
  assert.ok(detail.includes("mission.criteria"), "criteria must come from the parsed objective");
  assert.ok(!detail.includes("Budget"));
  assert.ok(!detail.includes("Risk"));
});

test("a failed delete form submission redirects instead of returning raw JSON", () => {
  const route = read("app/api/missions/[id]/route.ts");
  const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PATCH"));
  assert.ok(post.includes("NextResponse.redirect"), "form failures must land on a page");
  assert.ok(post.includes("mission-delete"));
  assert.ok(read("app/app/page.tsx").includes("mission-delete"), "the workspace must explain the failure");
});


test("mission detail exposes bounded, read-only research execution", () => {
  const detail = read("app/app/missions/[id]/page.tsx");
  const panel = read("components/mission-research-panel.tsx");
  const route = read("app/api/missions/[id]/research/route.ts");
  const research = read("lib/ai-research.ts");
  assert.ok(detail.includes("MissionResearchPanel"));
  assert.ok(panel.includes("Run a research pass"));
  assert.ok(panel.includes("will not buy, book, contact anyone"));
  assert.ok(route.includes("runAiGeneration"));
  assert.ok(route.includes("reserveAiGeneration"));
  assert.ok(research.includes('type: "web_search"'));
  assert.ok(research.includes('tool_choice: "required"'));
  assert.ok(research.includes("Read-only research"));
});

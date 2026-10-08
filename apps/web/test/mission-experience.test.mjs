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

test("mission research is clearly treated as unverified execution", () => {
  const panel = read("components/mission-research-panel.tsx");
  assert.match(panel, /Research result · Unverified/);
  assert.match(panel, /Saved research runs/);
  assert.match(panel, /submit forms/);
  assert.match(panel, /history_persisted/);
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
  assert.ok(panel.includes("Run this mission safely"));
  assert.ok(panel.includes("will not buy, book, contact anyone"));
  assert.ok(route.includes("runAiGeneration"));
  assert.ok(route.includes("reserveAiGeneration"));
  assert.ok(research.includes('type: "web_search"'));
  assert.ok(research.includes('tool_choice: "required"'));
  assert.match(research, /read-only research/i);
});

test("verification can attach saved execution evidence before outcome", () => {
  const controls = read("components/verification-controls.tsx");
  assert.ok(controls.includes("/api/missions/"));
  assert.ok(controls.includes("/research"));
  assert.ok(controls.includes("research_run_id"));
  assert.ok(controls.includes("Latest execution available"));
  assert.ok(controls.includes("still unverified"));
});

test("business workspace uses the same mission engine without inventing team data", () => {
  const page = read("app/app/business/page.tsx");
  assert.ok(page.includes("Business workspace"));
  assert.ok(page.includes("same missions"));
  assert.ok(page.includes("members, roles, shared missions"));
  assert.ok(!page.includes("member_id"));
});

test("business control center exposes approvals, agents, and roles", () => {
  const page = read("app/app/business/page.tsx");
  assert.ok(page.includes("Human control queue"));
  assert.ok(page.includes("Controlled AI workers"));
  assert.ok(page.includes("workspace member"));
  assert.ok(page.includes("ApprovalDecisionControls"));
});

test("approval request is explicit and bounded", () => {
  const control = read("components/approval-request-controls.tsx");
  assert.ok(control.includes("Request approval"));
  assert.ok(control.includes("requires_approval"));
  assert.ok(control.includes("bounded_action"));
  const route = read("app/api/missions/[id]/approval/route.ts");
  assert.ok(route.includes("request_mission_approval"));
});

test("approval decisions stay behind an authenticated server boundary", () => {
  const route = read("app/api/missions/approval/[approvalId]/decision/route.ts");
  assert.ok(route.includes("decide_mission_approval"));
  assert.ok(route.includes("Authentication required"));
});

test("bounded research agent is explicitly read-only", () => {
  const migration = readFileSync(join(webRoot, "../../supabase/migrations/20261008150000_w41_seed_bounded_research_agent.sql"), "utf8");
  assert.ok(migration.includes("ZAVQERA Research Agent"));
  assert.ok(migration.includes("'read_only'"));
  assert.ok(migration.includes("'external_side_effects',false"));
});


test("bounded research runs through the agent execution runtime", () => {
  const route = read("app/api/missions/[id]/research/route.ts");
  const migration = readFileSync(join(webRoot, "../../supabase/migrations/20261008152500_w43_bounded_agent_execution_runtime.sql"), "utf8");
  assert.ok(route.includes("start_agent_execution"));
  assert.ok(route.includes("complete_agent_execution"));
  assert.ok(route.includes("ZAVQERA Research Agent"));
  assert.ok(migration.includes("agent_executions"));
  assert.ok(migration.includes("authority_snapshot"));
  assert.ok(migration.includes("APPROVAL_REQUIRED"));
  assert.ok(migration.includes("EXECUTION_IDEMPOTENCY_BINDING_MISMATCH"));
  assert.ok(migration.includes("AGENT_EXECUTION_STARTED"));
  assert.ok(migration.includes("AGENT_EXECUTION_COMPLETED"));
});

test("agent execution completion is fail-closed and evidence-bearing", () => {
  const migration = readFileSync(join(webRoot, "../../supabase/migrations/20261008152500_w43_bounded_agent_execution_runtime.sql"), "utf8");
  assert.ok(migration.includes("p_status not in ('SUCCEEDED','FAILED','UNKNOWN','BLOCKED')"));
  assert.ok(migration.includes("p_evidence"));
  assert.ok(migration.includes("completed_at"));
  assert.ok(migration.includes("unique(workspace_id,idempotency_key)"));
});


test("mission detail exposes persisted agent execution evidence", () => {
  const page = read("app/app/missions/[id]/page.tsx");
  const repository = read("lib/supabase/mission-repository.ts");
  assert.ok(page.includes("Execution evidence"));
  assert.ok(page.includes("authority snapshot"));
  assert.ok(repository.includes("listAgentExecutions"));
  assert.ok(repository.includes("agent_executions"));
});

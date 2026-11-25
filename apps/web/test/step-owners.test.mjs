import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { assignedToYou, ownerName, ownerOf, ownerRefusal, ownersInUse, parseStepOwners, stepTakesOwner } from "../lib/step-owners.mjs";
import { eventDetail, humaniseEventType } from "../lib/mission-content.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const TEAM = "20261125180000_workspace_editors_work_on_missions.sql";
const OWNER = "20261125190000_step_owner.sql";
const migration = (name) => read(`../../supabase/migrations/${name}`);

const ME = "11111111-1111-1111-1111-111111111111";
const SARA = "22222222-2222-2222-2222-222222222222";

test("the database's answer is read defensively", () => {
  const parsed = parseStepOwners({
    can_assign: true,
    editors: [{ user_id: ME, email: "abdul@example.com" }, { user_id: SARA, email: "sara@example.com" }, { email: "no-id" }],
    owners: { a1: SARA, a2: 7 },
  }, ME);
  assert.deepEqual(parsed, {
    canAssign: true,
    editors: [{ id: ME, email: "abdul@example.com", isYou: true }, { id: SARA, email: "sara@example.com", isYou: false }],
    owners: { a1: SARA },
  });
  assert.equal(parseStepOwners(null, ME), null);
  assert.equal(parseStepOwners([], ME), null);
  assert.equal(parseStepOwners({ can_assign: "yes" }, ME).canAssign, false, "only a real true lets someone assign");
});

test("owners only appear once there is a team", () => {
  assert.equal(ownersInUse(null), false);
  assert.equal(ownersInUse({ canAssign: true, editors: [{ id: ME, email: "", isYou: true }], owners: {} }), false);
  const team = parseStepOwners({ can_assign: false, editors: [{ user_id: ME }, { user_id: SARA, email: "sara@example.com" }], owners: { a1: SARA, gone: "33333333-3333-3333-3333-333333333333" } }, ME);
  assert.equal(ownersInUse(team), true);
  assert.equal(ownerOf(team, "a1")?.id, SARA);
  assert.equal(ownerOf(team, "gone"), null, "an owner who is no longer an editor is not shown");
  assert.equal(ownerOf(team, "missing"), null);
});

test("people are named briefly, and the reader is You", () => {
  const t = (text) => ({ You: "Du" }[text] ?? text);
  assert.equal(ownerName({ id: ME, email: "abdul@example.com", isYou: true }, t), "Du");
  assert.equal(ownerName({ id: SARA, email: "sara.n@example.com", isYou: false }), "sara.n");
  assert.equal(ownerName({ id: SARA, email: "", isYou: false }), "A team member");
  assert.equal(ownerName(null), "");
});

test("only open steps take an owner and count as yours", () => {
  for (const status of ["PENDING", "RUNNING", "BLOCKED"]) assert.equal(stepTakesOwner(status), true, status);
  for (const status of ["COMPLETED", "CANCELLED", "", undefined]) assert.equal(stepTakesOwner(status), false, String(status));
  const rows = [
    { actionId: "s1", title: "Send contract", status: "PENDING", missionId: "m1", missionName: "Onboard Acme" },
    { actionId: "s2", title: "Collect W-9", status: "RUNNING", missionId: "m9", missionName: "Vendor" },
    { actionId: "s3", title: "Old", status: "COMPLETED", missionId: "m1", missionName: "Onboard Acme" },
  ];
  const split = assignedToYou(rows, ["m1"]);
  assert.deepEqual(split.here.map((row) => row.actionId), ["s1"]);
  assert.equal(split.elsewhere, 1, "a step in another workspace is counted, not linked: its page would not open here");
  assert.deepEqual(assignedToYou(null, []), { here: [], elsewhere: 0 });
});

test("each refusal from the database has a plain sentence", () => {
  assert.match(ownerRefusal("STALE_VERSION"), /changed while you were looking/);
  assert.match(ownerRefusal("ASSIGNEE_MUST_BE_EDITOR"), /can edit this workspace/);
  assert.match(ownerRefusal("ASSIGNEE_REQUIRES_OPEN_STEP"), /finished step keeps its owner/);
  assert.match(ownerRefusal("ACTION_NOT_FOUND_OR_FORBIDDEN 42501"), /view this mission but not change it/);
  assert.match(ownerRefusal("anything else"), /could not be saved/);
});

test("the history names an owner change without showing ids", () => {
  assert.equal(humaniseEventType("ACTION_ASSIGNED"), "Step owner changed");
  assert.equal(eventDetail("ACTION_ASSIGNED", { action_id: "a", assignee_id: SARA, previous_assignee_id: null }), "");
  assert.equal(eventDetail("ACTION_ASSIGNED", { action_id: "a", assignee_id: null, previous_assignee_id: SARA }), "Owner removed");
});

test("team members do the work; checking and closing stay with the creator", () => {
  const sql = migration(TEAM);
  for (const fn of ["private.transition_mission(", "private.advance_mission_lifecycle(", "private.complete_mission_action(", "private.transition_mission_action(", "private.set_mission_action_proof(", "public.guard_mission_action_insert("]) {
    assert.ok(sql.includes(`create or replace function ${fn}`), `${fn} is redefined`);
  }
  const code = sql.replace(/--[^\n]*/g, "");
  const creatorChecks = code.match(/owner_id\s*(=|<>)\s*auth\.uid\(\)/g) ?? [];
  assert.equal(creatorChecks.length, 1, "the daily work is no longer creator-only");
  assert.match(code, /or \(p_to_status in \('CANCELLED', 'FAILED', 'COMPLETED'\) and v_mission\.owner_id <> auth\.uid\(\)\) then/,
    "the one creator check left: only the creator ends the Mission");
  assert.ok((code.match(/can_edit_workspace\(/g) ?? []).length >= 6, "every one checks the workspace role instead");
  for (const kept of ["create_mission_verification", "commit_verified_mission_outcome", "update_mission_details"]) {
    assert.ok(!code.includes(kept), `${kept} is not touched: it stays with the creator`);
  }
  assert.ok(!/\b(drop table|delete from|truncate)\b/i.test(code), "nothing is deleted");
});

test("the database decides who can own a step", () => {
  const sql = migration(OWNER);
  const code = sql.replace(/--[^\n]*/g, "");
  assert.match(code, /add column if not exists assignee_id uuid references auth\.users\(id\) on delete set null/);
  assert.match(code, /private\.can_edit_workspace\(m\.workspace_id, auth\.uid\(\)\)/, "the caller must be able to edit");
  assert.match(code, /not private\.can_edit_workspace\(v_workspace_id, p_assignee_id\)/, "the person named must be able to edit");
  assert.match(code, /ASSIGNEE_REQUIRES_OPEN_STEP/);
  assert.match(code, /STALE_VERSION/);
  assert.match(code, /'ACTION_ASSIGNED'/, "every change is in the history");
  assert.match(code, /after delete or update of role on public\.workspace_members/, "leaving the team releases open steps");
  assert.match(code, /before insert on public\.mission_actions[\s\S]*steps_start_unassigned/, "a new step cannot arrive already naming someone");
  assert.match(code, /new\.assignee_id := null/);
  assert.match(code, /private\.is_workspace_member\(v_workspace_id, auth\.uid\(\)\)/, "owners are only read by members");
  assert.ok(!/grant[^;]*to[^;]*\banon\b/i.test(code), "nothing is granted to signed-out visitors");
  assert.ok(!/grant (update|insert)[^;]*mission_actions/i.test(code), "the column is never written directly");
  assert.ok(!/\b(drop table|delete from|truncate)\b/i.test(code), "nothing is deleted");
});

test("owners are read beside the page's other reads and never break it", () => {
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /const \[shareStatus, aiReady, plan, dates, calendarRead, stepOwners\] = await Promise\.all\(\[/);
  assert.match(page, /readStepOwners\(mission\.id\),\n  \]\);/);
  assert.match(page, /editable=\{stepOwners\.canAssign && !closed && stepTakesOwner\(action\.status\)\}/);
  assert.match(page, /href="\/app\/team"/, "alone in the workspace, the page invites the team instead");
  const home = read("app/app/page.tsx");
  assert.match(home, /await Promise\.all\(\[repository\.listMissions\(\), readStepsAssignedToYou\(\)\]\)/);
  const repository = read("lib/supabase/step-owner-repository.ts");
  assert.match(repository, /rpc\("mission_step_owners"/);
  assert.match(repository, /rpc\("set_mission_action_assignee"/);
  assert.equal((repository.match(/catch \{\n    return/g) ?? []).length, 1, "the owners read falls back instead of throwing");
  const missionsFile = read("lib/supabase/mission-repository.ts");
  const assignedRead = missionsFile.slice(missionsFile.indexOf("export async function readStepsAssignedToYou"));
  assert.match(assignedRead, /\.eq\("assignee_id", user\.id\)/);
  assert.match(assignedRead, /catch \{\n    return \[\];/, "the assigned list falls back instead of throwing");
  assert.ok(!repository.includes("auth.getSession("), "identity comes from getUser, never the cookie alone");
});

test("the owner route checks its input and leaves the decision to the database", () => {
  const route = read("app/api/missions/[id]/actions/[actionId]/owner/route.ts");
  assert.match(route, /export async function PUT/);
  assert.match(route, /Number\.isSafeInteger\(body\.expectedVersion\)/);
  assert.match(route, /body\.assigneeId !== null && \(typeof body\.assigneeId !== "string" \|\| !UUID\.test\(body\.assigneeId\)\)/);
  assert.match(route, /setStepOwner\(/);
});

test("assistants connected over MCP see exactly what they saw before", () => {
  // The OpenAI and Anthropic directory reviews are open: no tool output changes.
  const missions = read("lib/supabase/mission-repository.ts");
  assert.match(missions, /const ACTION_COLUMNS = "id, title, status, version, follow_up_at, evidence_note, evidence_url";/);
  for (const path of ["lib/mcp/data.ts", "lib/mcp/tools.mjs", "lib/mcp/format.mjs"]) {
    assert.ok(!/assignee|step-owner|step_owner/.test(read(path)), `${path} does not know about owners`);
  }
});

test("every new phrase is translated", () => {
  const phrases = [
    "Step owner", "Owner:", "No owner", "A team member", "The owner could not be saved. Try again.",
    "This step changed while you were looking. The page has the latest version now; try again.",
    "Only someone who can edit this workspace can own a step.", "A finished step keeps its owner.",
    "You can view this mission but not change it.",
    "Doing this with someone? Invite them, then give each step an owner so everyone knows what is theirs.",
    "Invite your team", "Your steps", "Assigned to you",
    "{count} more step is yours in another workspace.", "{count} more steps are yours in another workspace.",
    "Switch workspace", "Step owner changed", "Owner removed", "You", "Saving…",
  ];
  // Read as text: the Node version Netlify builds with cannot import .ts.
  const dictionaries = read("lib/i18n.ts");
  for (const phrase of phrases) {
    const entries = dictionaries.split(`${JSON.stringify(phrase)}:`).length - 1;
    assert.ok(entries >= 5, `"${phrase}" is in every language (found ${entries})`);
  }
});

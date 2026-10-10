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
  summariseApprovalScope,
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

test("Mission research UI copy is localized in every supported workspace language", () => {
  const panel = read("components/mission-research-panel.tsx");
  const dictionary = read("components/localized-text.tsx");
  const uiKeys = [
    "Execution · Read-only",
    "Run this mission safely",
    "ZAVQERA can safely research the public web against this mission's intent and success criteria. It will not buy, book, contact anyone, submit forms, or change an account.",
    "Researching…",
    "Run research again",
    "Run research",
    "Checking saved research…",
    "Research ran, but saved history could not be confirmed. The findings below still remain unverified.",
    "Research result · Unverified",
    "Sources",
    "This run has no external side effects. Review the findings before treating them as evidence or making a consequential decision.",
    "Saved research runs",
    "source",
    "sources",
    "Unverified",
  ];
  for (const key of uiKeys) {
    assert.ok(panel.includes(key), "research panel is missing localized UI text: " + key);
    const line = dictionary.split("\n").find((entry) => entry.startsWith('  "' + key + '":'));
    assert.ok(line, "missing localization dictionary entry for: " + key);
    for (const language of ["nb", "ar", "es", "fr", "de"]) {
      assert.ok(line.includes(language + ': "'), "missing " + language + " translation for: " + key);
    }
  }
  const apiErrorKeys = [
    "Authentication is required.",
    "Mission not found.",
    "Research history could not be loaded.",
  ];
  for (const key of apiErrorKeys) {
    const line = dictionary.split("\n").find((entry) => entry.startsWith('  "' + key + '":'));
    assert.ok(line, "missing localization dictionary entry for: " + key);
    for (const language of ["nb", "ar", "es", "fr", "de"]) {
      assert.ok(line.includes(language + ': "'), "missing " + language + " translation for: " + key);
    }
  }
  assert.ok(panel.includes("<LocalizedText en={error} />"));
  assert.ok(panel.includes("toLocaleString()"));
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
  assert.ok(page.includes("Invite teammates by email and assign only the access they need."));
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


test("business collaboration exposes least-privilege invitations", () => {
  const page = read("app/app/business/page.tsx");
  const invite = read("app/app/business/invite/page.tsx");
  const route = read("app/api/business/invitations/route.ts");
  const migration = readFileSync(join(webRoot, "../../supabase/migrations/20261008160000_w44_workspace_invitations.sql"), "utf8");
  assert.ok(page.includes("Invite a teammate"));
  assert.ok(invite.includes("member") && invite.includes("viewer") && invite.includes("admin"));
  assert.ok(route.includes("createSupabaseMissionRepository"));
  assert.ok(route.includes("createWorkspaceInvitation"));
  assert.ok(route.includes("7 * 86400000"));
  assert.ok(migration.includes("WORKSPACE_ADMIN_REQUIRED"));
  assert.ok(migration.includes("INVITATION_ALREADY_PENDING"));
  assert.ok(migration.includes("token_hash"));
});

test("approval scope summary is bounded, readable, and never dumps identifiers", () => {
  const summary = summariseApprovalScope({
    type: "bounded_action",
    requires_approval: true,
    external_side_effects: false,
    allowed_actions: ["read"],
    action_id: "sensitive-internal-id",
    secret_token: "never-render",
    nested: { payload: true },
  });
  assert.match(summary, /bounded_action/);
  assert.match(summary, /Requires approval: Yes/);
  assert.match(summary, /External side effects: No/);
  assert.ok(!summary.includes("sensitive-internal-id"));
  assert.ok(!summary.includes("never-render"));
  assert.ok(!summary.includes("{"));
  assert.ok(summary.length <= 360);
});

test("Approval Center presents context and keeps decisions restricted to owners and admins", () => {
  const page = read("app/app/business/approvals/page.tsx");
  const center = read("components/approval-center.tsx");
  const route = read("app/api/missions/approval/[approvalId]/decision/route.ts");
  const repository = read("lib/supabase/mission-repository.ts");
  assert.ok(page.includes("Approval Center"));
  assert.ok(center.includes("Requested scope"));
  assert.ok(center.includes("Agent authority"));
  assert.ok(center.includes("Why approval is required"));
  assert.ok(center.includes("does not execute the action by itself"));
  assert.ok(center.includes("Only workspace owners and admins"));
  assert.ok(repository.includes("async canDecideApprovals"));
  assert.ok(repository.includes('role === "owner" || role === "admin"'));
  assert.ok(route.includes("decide_mission_approval"));
  assert.ok(route.includes("A reason is required when rejecting"));
});


test("execution recovery is explicit, evidence-aware, and prohibits retrying unknown outcomes", () => {
  const controls = read("components/agent-execution-controls.tsx");
  const route = read("app/api/agent-executions/[executionId]/route.ts");
  const migration = readFileSync(join(webRoot, "../../supabase/migrations/20261009150000_w49_agent_execution_recovery.sql"), "utf8");
  assert.ok(controls.includes("Request cancellation"));
  assert.ok(controls.includes("Outcome unknown"));
  assert.ok(controls.includes("Do not retry"));
  assert.ok(controls.includes("Retry attempt"));
  assert.ok(route.includes("request_agent_execution_cancellation"));
  assert.ok(route.includes("reconcile_stale_agent_execution"));
  assert.ok(route.includes("retry_agent_execution"));
  assert.ok(migration.includes("EXECUTION_OUTCOME_UNKNOWN_NOT_RETRYABLE"));
  assert.ok(migration.includes("EXECUTION_LEASE_EXPIRED"));
  assert.ok(migration.includes("safe_to_retry', false"));
  assert.ok(migration.includes("revoke insert, update on public.agent_executions from anon, authenticated"));
});

test("execution history exposes reconciliation and attempt lineage without dumping raw errors", () => {
  const page = read("app/app/missions/[id]/page.tsx");
  const repository = read("lib/supabase/mission-repository.ts");
  const controls = read("components/agent-execution-controls.tsx");
  assert.ok(page.includes("Attempt {execution.attemptNumber}"));
  assert.ok(page.includes("Lease expires"));
  assert.ok(page.includes("reconciled"));
  assert.ok(repository.includes("retry_of_execution_id"));
  assert.ok(repository.includes("lease_expires_at"));
  assert.ok(controls.includes("function failureLabel"));
  assert.ok(!controls.includes("execution.errorMessage"));
});

test("research history is never reported as persisted when its repository writer is unavailable", () => {
  const route = read("app/api/missions/[id]/research/route.ts");
  assert.match(route, /let historyPersisted = false;/);
  assert.match(route, /if \(repository\.recordResearchRun\) \{/);
  assert.match(route, /historyPersisted = true;/);
  assert.doesNotMatch(route, /recordResearchRun\?\./);
  assert.doesNotMatch(route, /let historyPersisted = true;/);
});


test("approval request control localizes its states and always clears the busy state after network failure", () => {
  const control = read("components/approval-request-controls.tsx");
  const dictionary = read("components/localized-text.tsx");

  assert.match(control, /if \(busy\) return/);
  assert.match(control, /if \(!response\.ok\)/);
  assert.match(control, /catch \{/);
  assert.match(control, /finally \{\s*setBusy\(false\)/s);
  assert.match(control, /role="status"/);
  assert.match(control, /role="alert"/);
  assert.match(control, /requires_approval: true/);

  const nbAr = dictionary.slice(dictionary.indexOf("const WORKSPACE_NB_AR:"));
  const esFrDe = dictionary.slice(
    dictionary.indexOf("const WORKSPACE_TRANSLATIONS:"),
    dictionary.indexOf("const WORKSPACE_NB_AR:"),
  );

  for (const key of [
    "Request approval",
    "Requesting…",
    "Approval requested",
    "Approval could not be requested. Check your connection and try again.",
  ]) {
    assert.ok(control.includes(key), "approval control must use the localized key: " + key);
    assert.ok(nbAr.includes('"' + key + '": { nb:'), "missing Norwegian/Arabic translations for: " + key);
    const translatedEntry = esFrDe.split("\n").find((entry) => entry.includes('"' + key + '":'));
    assert.ok(translatedEntry, "missing Spanish/French/German translations for: " + key);
    for (const locale of ["es", "fr", "de"]) {
      assert.ok(
        translatedEntry.includes(locale + ":") || translatedEntry.includes('"' + locale + '":'),
        "missing " + locale + " translation for: " + key,
      );
    }
  }
});

test("business invitation form and endpoint errors are localized in all supported languages", () => {
  const invite = read("app/app/business/invite/page.tsx");
  const route = read("app/api/business/invitations/route.ts");
  const dictionary = read("components/localized-text.tsx");
  const esFrDe = dictionary.slice(
    dictionary.indexOf("const WORKSPACE_TRANSLATIONS:"),
    dictionary.indexOf("const WORKSPACE_NB_AR:"),
  );
  const nbAr = dictionary.slice(
    dictionary.indexOf("const WORKSPACE_NB_AR:"),
    dictionary.indexOf("for (const [key, translations] of Object.entries(WORKSPACE_NB_AR))"),
  );
  const formKeys = [
    "Email address",
    "Workspace role",
    "Grant only the access needed. Admins can manage workspace access.",
    "Admin",
    "Member",
    "Viewer",
    "Sending invitation…",
    "Send email invitation",
    "Back to Business workspace",
    "The invitation email could not be sent.",
  ];
  const endpointErrorKeys = [
    "Workspace invitations require the connected workspace backend.",
    "Workspace invitations are not available.",
  ];

  for (const key of formKeys) {
    assert.ok(invite.includes(key), "invitation form must use the localized key: " + key);
  }
  for (const key of endpointErrorKeys) {
    assert.ok(route.includes(key), "invitation endpoint must use the localized error key: " + key);
  }
  for (const key of [...formKeys, ...endpointErrorKeys]) {
    const esFrDeEntry = esFrDe.split("\n").find((entry) => entry.trimStart().startsWith('"' + key + '":'));
    const nbArEntry = nbAr.split("\n").find((entry) => entry.trimStart().startsWith('"' + key + '":'));
    assert.ok(esFrDeEntry, "missing Spanish/French/German mapping for: " + key);
    assert.ok(nbArEntry, "missing Norwegian/Arabic mapping for: " + key);
    for (const locale of ["es", "fr", "de"]) {
      assert.ok(esFrDeEntry.includes(locale + ":"), "missing " + locale + " translation for: " + key);
    }
    for (const locale of ["nb", "ar"]) {
      assert.ok(nbArEntry.includes(locale + ":"), "missing " + locale + " translation for: " + key);
    }
  }
});

test("business approval, invitation, and notification copy is localized in all supported languages", () => {
  const groups = [
    { path: "app/app/business/invite/page.tsx", keys: [
      "Send a secure invitation directly to their inbox. Choose the least-privilege role they need. Invitations expire after 7 days.",
    ] },
    { path: "app/invite/[token]/page.tsx", keys: [
      "The invitation could not be loaded. Please try again later.",
    ] },
    { path: "app/app/business/approvals/page.tsx", keys: [
      "Yes", "No",
      "Human control", "Approval Center",
      "Review the requested action, scope, assigned agent, and authority before recording a decision.",
      "Awaiting decision", "You can decide", "Implicit approvals",
    ] },
    { path: "components/approval-center.tsx", keys: [
      "Approval request · Pending", "Requested action", "Mission-level approval", "Assigned agent",
      "No agent linked to this mission", "Requested by", "Submitted", "Requested scope",
      "Agent authority", "No agent authority snapshot is attached to this request.",
      "Why approval is required",
      "This action is gated by workspace policy and must be explicitly approved before execution.",
      "This request needs a recorded human decision before any approval-gated action can proceed.",
      "Approving records permission for the bounded scope above. It does not execute the action by itself; the execution runtime must still enforce the approved scope and authority. Review the mission evidence before deciding. Rejected requests require a reason and remain non-executable.",
      "Open mission and evidence",
      "Only workspace owners and admins can approve or reject requests. You can still inspect the mission and its evidence.",
      "No approvals waiting",
      "There are no pending requests in this workspace. Actions that require approval remain blocked until an explicit approval is recorded.",
      "Back to business workspace",
    ] },
    { path: "components/member-management-controls.tsx", keys: ["Owner protected", "Remove"] },
    { path: "components/invitation-revoke-button.tsx", keys: ["Revoking…", "Revoke"] },
    { path: "components/approval-decision-controls.tsx", keys: [
      "Decision note", "required to reject", "Saving…", "Approve bounded scope",
    ] },
    { path: "app/app/notifications/page.tsx", keys: ["Human decision required", "Review this decision"] },
  ];
  const dictionary = read("components/localized-text.tsx");
  const esFrDe = dictionary.slice(
    dictionary.indexOf("const WORKSPACE_TRANSLATIONS:"),
    dictionary.indexOf("const WORKSPACE_NB_AR:"),
  );
  const nbAr = dictionary.slice(
    dictionary.indexOf("const WORKSPACE_NB_AR:"),
    dictionary.indexOf("for (const [key, translations] of Object.entries(WORKSPACE_NB_AR))"),
  );
  for (const group of groups) {
    const source = read(group.path);
    for (const key of group.keys) {
      assert.ok(source.includes(key), group.path + " must use localized copy: " + key);
      const esFrDeEntry = esFrDe.split(String.fromCharCode(10)).find((entry) => entry.trimStart().startsWith(JSON.stringify(key) + ":"));
      const nbArEntry = nbAr.split(String.fromCharCode(10)).find((entry) => entry.trimStart().startsWith(JSON.stringify(key) + ":"));
      assert.ok(esFrDeEntry, "missing Spanish/French/German mapping for: " + key);
      assert.ok(nbArEntry, "missing Norwegian/Arabic mapping for: " + key);
      for (const locale of ["es", "fr", "de"]) {
        assert.ok(esFrDeEntry.includes(locale + ":"), "missing " + locale + " translation for: " + key);
      }
      for (const locale of ["nb", "ar"]) {
        assert.ok(nbArEntry.includes(locale + ":"), "missing " + locale + " translation for: " + key);
      }
    }
  }
});

test("collaboration, approval, research recovery, and execution API errors are localized", () => {
  const groups = [{"path":"app/api/business/invitations/revoke/route.ts","keys":["Invitations are unavailable.","Invitation id is required.","The invitation could not be revoked."]},{"path":"app/api/business/members/role/route.ts","keys":["Member management is unavailable.","Member and role are required.","The member role could not be changed."]},{"path":"app/api/business/members/remove/route.ts","keys":["Member management is unavailable.","Member is required.","The member could not be removed."]},{"path":"app/api/missions/approval/[approvalId]/decision/route.ts","keys":["A valid decision request is required.","Invalid approval decision.","Decision notes must be 4,000 characters or fewer.","A reason is required when rejecting an approval request.","Authentication required.","This request has already been decided. Refresh the queue.","The decision could not be recorded. Check your workspace role and refresh the queue.","The approval service could not complete this request."]},{"path":"app/api/missions/[id]/research/route.ts","keys":["Research may have completed, but execution recovery evidence could not be recorded.","The research attempt could not be safely reconciled. Inspect execution history before retrying.","An attempt with this request ID already exists. Inspect execution history before starting another attempt.","The research execution boundary was not recorded."]},{"path":"app/api/agent-executions/[executionId]/route.ts","keys":["You do not have permission to change this execution.","This execution lease has not expired. Refresh its status and try again later.","The outcome is unknown. Verify the external result before attempting new work.","A retry already exists for this attempt. Refresh the execution history.","Only a confirmed FAILED or BLOCKED attempt can be retried.","Agent authority changed. Review the current authority before retrying.","Current approval is missing or no longer valid.","This execution is no longer running.","The retry key is already bound to another execution.","The retry request key is invalid.","This mission is closed and cannot be retried.","The execution action could not be recorded. Refresh and inspect the execution history.","A valid execution action is required.","Invalid execution action.","A valid retry request key is required.","The execution service could not complete this action."]}];
  const dictionary = read("components/localized-text.tsx");
  const esFrDe = dictionary.slice(
    dictionary.indexOf("const WORKSPACE_TRANSLATIONS:"),
    dictionary.indexOf("const WORKSPACE_NB_AR:"),
  );
  const nbAr = dictionary.slice(
    dictionary.indexOf("const WORKSPACE_NB_AR:"),
    dictionary.indexOf("for (const [key, translations] of Object.entries(WORKSPACE_NB_AR))"),
  );
  for (const group of groups) {
    const source = read(group.path);
    for (const key of group.keys) {
      assert.ok(source.includes(JSON.stringify(key)), group.path + " must contain its error key: " + key);
      const esFrDeEntry = esFrDe.split(String.fromCharCode(10)).find((entry) => entry.trimStart().startsWith(JSON.stringify(key) + ":"));
      const nbArEntry = nbAr.split(String.fromCharCode(10)).find((entry) => entry.trimStart().startsWith(JSON.stringify(key) + ":"));
      assert.ok(esFrDeEntry, "missing Spanish/French/German mapping for API error: " + key);
      assert.ok(nbArEntry, "missing Norwegian/Arabic mapping for API error: " + key);
      for (const locale of ["es", "fr", "de"]) assert.ok(esFrDeEntry.includes(locale + ":"), "missing " + locale + " translation for: " + key);
      for (const locale of ["nb", "ar"]) assert.ok(nbArEntry.includes(locale + ":"), "missing " + locale + " translation for: " + key);
    }
  }
});

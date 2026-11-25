import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { handleMcpMessage, handleMcpPayload, negotiateProtocolVersion, LATEST_PROTOCOL_VERSION, SERVER_INSTRUCTIONS } from "../lib/mcp/protocol.mjs";
import { TOOLS, callTool, toolDescriptors, BOUNDS } from "../lib/mcp/tools.mjs";
import { nextSteps, missionSummary } from "../lib/mcp/format.mjs";
import { authChallenge, bearerToken, protectedResourceMetadata, authorizationServerFor } from "../lib/mcp/http.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const S2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const S3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const TODAY = "2026-11-25";
const ORIGIN = "https://zavqera.com";

function action(id, title, status = "PENDING", extra = {}) {
  return { id, title, status, version: 1, followUpAt: null, evidenceNote: null, evidenceUrl: null, ...extra };
}

function mission(id, name, actions, status = "ACTIVE") {
  const live = actions.filter((step) => step.status !== "CANCELLED");
  const done = actions.filter((step) => step.status === "COMPLETED").length;
  return {
    id, name, intent: `Get ${name.toLowerCase()} done properly.`, status, lifecycleStatus: status === "COMPLETED" ? "COMPLETED" : "RUNNING",
    progress: live.length ? Math.round((done / live.length) * 100) : 0, actionsTotal: live.length, actionsCompleted: done,
    criteria: ["It is done"], actions, outcomes: [], verifications: [], activity: [], updated: "2026-11-24T10:00:00Z", owner: "You", version: 1,
  };
}

/** An in-memory workspace with the same contract as lib/mcp/data.ts. */
function fakeApi() {
  const calls = [];
  const missions = new Map([
    [M1, mission(M1, "Renew passport", [action(S1, "Book an appointment", "RUNNING"), action(S2, "Gather documents"), action(S3, "Old idea", "CANCELLED")])],
    [M2, mission(M2, "Launch site", [action("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", "Ship", "COMPLETED")], "COMPLETED")],
  ]);
  const dates = { [M1]: { targetDate: "2026-12-20", dueDates: { [S2]: { dueOn: "2026-11-20", basis: "law" } } } };
  let created = 0;
  return {
    calls,
    missions,
    templates: [{ id: "launch-plan", title: "Launch a small project", description: "Turn an idea into a plan.", intent: "Prepare and validate a small project launch.", criteria: ["Validated"], actions: ["Describe the user", "Collect evidence"] }],
    async listMissions() { return [...missions.values()]; },
    async getMission(id) { return missions.get(id) ?? null; },
    async datesFor(ids) { return Object.fromEntries(ids.map((id) => [id, dates[id] ?? { targetDate: null, dueDates: {} }])); },
    async findRecentMission(objective) { calls.push(["findRecent", objective]); return [...missions.values()].find((m) => m.objective === objective)?.id ?? null; },
    async createMission({ objective, actions }) {
      calls.push(["create", objective, actions]);
      created += 1;
      const id = `33333333-3333-4333-8333-33333333333${created}`;
      const made = mission(id, objective.split("\n")[0], actions.map((title, index) => action(`cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`, title)));
      made.objective = objective;
      missions.set(id, made);
      return made;
    },
    async addSteps(missionId, titles) { calls.push(["addSteps", missionId, titles]); return []; },
    async completeStep(input) { calls.push(["complete", input]); },
    async setStepProof(input) { calls.push(["proof", input]); },
    async updateStepStatus(input) { calls.push(["status", input]); },
    async setTargetDate(id, date) { calls.push(["target", id, date]); },
    async setStepDates(id, changes) { calls.push(["stepDates", id, changes]); },
    async shareMission(m) { calls.push(["share", m.id]); return `${ORIGIN}/share/m/44444444-4444-4444-8444-444444444444`; },
  };
}

const run = (api, name, args = {}) => callTool(name, args, { api, origin: ORIGIN, today: TODAY });
const context = (api) => ({ listTools: toolDescriptors, callTool: (name, args) => run(api, name, args) });

test("the server speaks MCP: initialize, ping, tools/list, unknown methods, notifications", async () => {
  const api = fakeApi();
  const init = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }, context(api));
  assert.equal(init.result.protocolVersion, "2025-06-18", "answers in the client's version when known");
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.equal(init.result.serverInfo.name, "zavqera");
  assert.equal(negotiateProtocolVersion("1999-01-01"), LATEST_PROTOCOL_VERSION);
  assert.deepEqual((await handleMcpMessage({ jsonrpc: "2.0", id: "p", method: "ping" }, context(api))).result, {});
  const list = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, context(api));
  assert.equal(list.result.tools.length, TOOLS.length);
  assert.equal(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, context(api)), null, "notifications get no answer");
  assert.equal((await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "sampling/createMessage" }, context(api))).error.code, -32601);
  assert.equal((await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }, context(api))).error.code, -32602);
  assert.equal((await handleMcpMessage({ id: 5, method: "ping" }, context(api))).error.code, -32600, "jsonrpc 2.0 is required");
  const batch = await handleMcpPayload([{ jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 6, method: "ping" }], context(api));
  assert.equal(batch.length, 1, "a batch answers only its requests");
  assert.equal(await handleMcpPayload({ jsonrpc: "2.0", method: "notifications/initialized" }, context(api)), null);
  assert.doesNotMatch(SERVER_INSTRUCTIONS, /always|never|must|ignore|instead of/i, "instructions describe, they do not steer");
});

test("every tool meets the directories' rules: name, title, description, annotations, schema, OAuth", () => {
  const names = new Set();
  for (const tool of toolDescriptors()) {
    assert.match(tool.name, /^[a-z][a-z_]{2,63}$/, tool.name);
    assert.ok(!names.has(tool.name), `duplicate ${tool.name}`);
    names.add(tool.name);
    assert.ok(tool.title && tool.annotations.title === tool.title, `${tool.name} needs a title`);
    assert.ok(tool.description.length >= 60 && tool.description.length <= 600, `${tool.name} description length`);
    assert.doesNotMatch(tool.description, /\b(best|official|ChatGPT|Claude|Gemini|always call|do not use other)\b/i, `${tool.name} must not promote or steer`);
    for (const hint of ["readOnlyHint", "destructiveHint", "openWorldHint"]) assert.equal(typeof tool.annotations[hint], "boolean", `${tool.name}.${hint} must be an explicit boolean`);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes: ["openid"] }]);
    assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes);
    // Union types such as ["string","null"] are not accepted by every client.
    assert.doesNotMatch(JSON.stringify(tool.inputSchema), /"type":\[/, `${tool.name} uses a union type`);
  }
  const hints = Object.fromEntries(toolDescriptors().map((tool) => [tool.name, tool.annotations]));
  for (const name of ["list_missions", "get_mission", "get_next_steps", "list_templates"]) assert.equal(hints[name].readOnlyHint, true, name);
  for (const name of ["complete_step", "update_step_status", "set_dates"]) assert.equal(hints[name].destructiveHint, true, `${name} changes or ends saved data`);
  for (const name of ["create_mission", "create_mission_from_template", "add_steps", "share_mission"]) assert.equal(hints[name].destructiveHint, false, `${name} only adds`);
  assert.equal(hints.share_mission.openWorldHint, true, "sharing publishes a public link");
  assert.equal(Object.values(hints).filter((h) => h.openWorldHint).length, 1, "nothing else leaves the private workspace");
});

test("list_missions and get_mission give the assistant the ids and facts it needs", async () => {
  const api = fakeApi();
  const list = await run(api, "list_missions");
  assert.equal(list.isError, undefined);
  assert.equal(list.structuredContent.missions.length, 1, "active only by default");
  const summary = list.structuredContent.missions[0];
  assert.equal(summary.mission_id, M1);
  assert.equal(summary.steps_total, 2, "a cancelled step leaves the count");
  assert.equal(summary.late_steps, 1);
  assert.equal(summary.days_left, 25);
  assert.equal(summary.next_step.step_id, S1, "the step in progress comes first");
  assert.equal(summary.url, `${ORIGIN}/app/missions/${M1}`);
  assert.match(list.content[0].text, new RegExp(M1));
  assert.equal((await run(api, "list_missions", { state: "all" })).structuredContent.missions.length, 2);
  assert.equal((await run(api, "list_missions", { limit: 0 })).isError, true);

  const detail = await run(api, "get_mission", { mission_id: M1 });
  const steps = detail.structuredContent.mission.steps;
  assert.deepEqual(steps.map((step) => step.status), ["in_progress", "not_started", "cancelled"]);
  assert.equal(steps[1].due_set_by_law, true);
  assert.match(detail.content[0].text, /step_id aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/);
  assert.match(detail.content[0].text, /deadline set by law/);
  const missing = await run(api, "get_mission", { mission_id: "99999999-9999-4999-8999-999999999999" });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /list_missions/);
  assert.equal((await run(api, "get_mission", { mission_id: "not-an-id" })).isError, true);
});

test("get_next_steps puts late steps first, then due soon, then each Mission's next step", () => {
  const a = mission(M1, "A", [action(S1, "Late one"), action(S2, "Soon one"), action(S3, "Undated")]);
  const b = mission(M2, "B", [action("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", "B first")]);
  const items = nextSteps([
    { mission: a, dates: { targetDate: null, dueDates: { [S1]: { dueOn: "2026-11-20", basis: null }, [S2]: { dueOn: "2026-11-28", basis: null } } } },
    { mission: b, dates: { targetDate: null, dueDates: {} } },
  ], TODAY);
  assert.deepEqual(items.map((item) => [item.reason, item.title]), [["late", "Late one"], ["due_soon", "Soon one"], ["next", "B first"]]);
  assert.equal(items[0].days_until_due, -5);
  assert.equal(nextSteps([], TODAY).length, 0);
});

test("create_mission saves the plan the assistant wrote, once, with a target date", async () => {
  const api = fakeApi();
  const result = await run(api, "create_mission", {
    name: "Move to Berlin\n\nnow",
    intent: "Move to Berlin in March and be registered on time.",
    success_criteria: ["Registered at the Bürgeramt"],
    steps: ["Find a flat", "  ", "Register the address"],
    target_date: "2027-03-31",
  });
  assert.equal(result.isError, undefined, result.content[0].text);
  const [, objective, steps] = api.calls.find((call) => call[0] === "create");
  assert.match(objective, /^Move to Berlin now\n\nMove to Berlin in March/, "the name is one line, so the stored shape stays readable");
  assert.match(objective, /Success criteria:\nRegistered at the Bürgeramt$/);
  assert.deepEqual(steps, ["Find a flat", "Register the address"], "blank steps are dropped");
  assert.ok(api.calls.some((call) => call[0] === "target" && call[2] === "2027-03-31"));
  assert.match(result.content[0].text, /Saved as a new Mission with 2 steps/);

  const again = await run(api, "create_mission", { name: "Move to Berlin now", intent: "Move to Berlin in March and be registered on time.", success_criteria: ["Registered at the Bürgeramt"], steps: ["Find a flat", "Register the address"] });
  assert.match(again.content[0].text, /already saved a moment ago/, "a retry does not make a copy");
  assert.equal(api.calls.filter((call) => call[0] === "create").length, 1);

  for (const [args, pattern] of [
    [{ name: "X", intent: "too short" }, /at least 12 characters/],
    [{ name: "", intent: "A goal written as a sentence." }, /name/],
    [{ name: "X", intent: "A goal written as a sentence.", target_date: "2027-02-30" }, /real date/],
    [{ name: "X", intent: "A goal written as a sentence.", steps: Array.from({ length: BOUNDS.steps + 1 }, (_, i) => `Step ${i}`) }, /at most 50 items/],
    [{ name: "X", intent: "A goal written as a sentence.", steps: "one" }, /list/],
  ]) {
    const refused = await run(api, "create_mission", args);
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, pattern);
  }
});

test("create_mission_from_template uses ZAVQERA's template and says which ids exist", async () => {
  const api = fakeApi();
  const ok = await run(api, "create_mission_from_template", { template_id: "launch-plan", name: "My shop" });
  assert.equal(ok.isError, undefined);
  const [, objective, steps] = api.calls.find((call) => call[0] === "create");
  assert.match(objective, /^My shop\n\nPrepare and validate/);
  assert.deepEqual(steps, ["Describe the user", "Collect evidence"]);
  const unknown = await run(api, "create_mission_from_template", { template_id: "nope" });
  assert.match(unknown.content[0].text, /Available: launch-plan/);
  assert.equal((await run(api, "list_templates")).structuredContent.templates[0].template_id, "launch-plan");
});

test("complete_step records proof, refuses cancelled steps, and never reopens a done step", async () => {
  const api = fakeApi();
  const done = await run(api, "complete_step", { mission_id: M1, step_id: S1, proof_note: "Ref 48213", proof_url: "example.com/receipt" });
  assert.equal(done.isError, undefined, done.content[0].text);
  const call = api.calls.find((entry) => entry[0] === "complete")[1];
  assert.deepEqual([call.actionId, call.expectedVersion, call.evidenceNote, call.evidenceUrl], [S1, 1, "Ref 48213", "https://example.com/receipt"]);
  assert.match((await run(api, "complete_step", { mission_id: M1, step_id: S3 })).content[0].text, /cancelled/);
  assert.match((await run(api, "complete_step", { mission_id: M1, step_id: S1, proof_url: "ftp://x" })).content[0].text, /https:\/\//);
  api.missions.get(M1).actions[0].status = "COMPLETED";
  assert.match((await run(api, "complete_step", { mission_id: M1, step_id: S1 })).content[0].text, /already done; nothing changed/);
  await run(api, "complete_step", { mission_id: M1, step_id: S1, proof_note: "New ref" });
  assert.ok(api.calls.some((entry) => entry[0] === "proof"), "proof on a done step replaces it");
  assert.match((await run(api, "complete_step", { mission_id: M1, step_id: M2 })).content[0].text, /not a step of this Mission/);
});

test("update_step_status follows the Mission's rules and says which moves are allowed", async () => {
  const api = fakeApi();
  const ok = await run(api, "update_step_status", { mission_id: M1, step_id: S2, status: "in_progress" });
  assert.equal(ok.isError, undefined);
  assert.deepEqual(api.calls.find((entry) => entry[0] === "status")[1], { actionId: S2, status: "RUNNING", expectedVersion: 1, missionId: M1 });
  const final = await run(api, "update_step_status", { mission_id: M1, step_id: S3, status: "in_progress" });
  assert.match(final.content[0].text, /final/);
  const viaDone = await run(api, "update_step_status", { mission_id: M1, step_id: S2, status: "done" });
  assert.match(viaDone.content[0].text, /complete_step/);
  const backwards = await run(api, "update_step_status", { mission_id: M1, step_id: S1, status: "not_started" });
  assert.match(backwards.content[0].text, /can move to: done \(with complete_step\), waiting, cancelled/);
});

test("set_dates changes only what it is given, and \"none\" removes a date", async () => {
  const api = fakeApi();
  const saved = await run(api, "set_dates", { mission_id: M1, target_date: "none", step_due_dates: [{ step_id: S1, due_date: "2026-12-01" }, { step_id: S2, due_date: "none" }] });
  assert.equal(saved.isError, undefined, saved.content[0].text);
  assert.deepEqual(api.calls.find((entry) => entry[0] === "target"), ["target", M1, null]);
  assert.deepEqual(api.calls.find((entry) => entry[0] === "stepDates")[2], [{ actionId: S1, dueOn: "2026-12-01", basis: null }, { actionId: S2, dueOn: null, basis: null }]);
  assert.match((await run(api, "set_dates", { mission_id: M1 })).content[0].text, /Give target_date/);
  assert.match((await run(api, "set_dates", { mission_id: M1, step_due_dates: [{ step_id: M2, due_date: "2026-12-01" }] })).content[0].text, /not a step/);
  const forbidden = { ...fakeApi(), async setTargetDate() { const error = new Error("forbidden"); error.name = "PlanDatesError"; error.reason = "forbidden"; throw error; } };
  assert.match((await run(forbidden, "set_dates", { mission_id: M1, target_date: "2027-01-01" })).content[0].text, /Only the person who created this Mission/);
});

test("share_mission returns a public link and says proof is not included", async () => {
  const api = fakeApi();
  const shared = await run(api, "share_mission", { mission_id: M1 });
  assert.equal(shared.structuredContent.share_url, `${ORIGIN}/share/m/44444444-4444-4444-8444-444444444444`);
  assert.match(shared.content[0].text, /no proof is included/);
});

test("a failure inside a tool is explained, never a bare server error", async () => {
  const api = { ...fakeApi(), async listMissions() { throw new Error("connection reset"); } };
  const failed = await run(api, "list_missions");
  assert.equal(failed.isError, true);
  assert.match(failed.content[0].text, /could not complete this just now/);
  const conflict = { ...fakeApi(), async completeStep() { const error = new Error("x"); error.name = "MissionMutationConflictError"; throw error; } };
  assert.match((await run(conflict, "complete_step", { mission_id: M1, step_id: S2 })).content[0].text, /changed since it was read/);
});

test("OAuth discovery points at the project's Supabase Auth and a 401 says where to look", () => {
  const metadata = protectedResourceMetadata({ origin: ORIGIN, supabaseUrl: "https://abc.supabase.co/" });
  assert.equal(metadata.resource, `${ORIGIN}/mcp`, "the resource is exactly the URL people paste");
  assert.deepEqual(metadata.authorization_servers, ["https://abc.supabase.co/auth/v1"], "one issuer, as Claude uses only the first");
  assert.equal(authorizationServerFor("https://abc.supabase.co"), "https://abc.supabase.co/auth/v1");
  assert.deepEqual(metadata.scopes_supported, ["openid"]);
  assert.equal(authChallenge(ORIGIN), `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="openid"`);
  assert.match(authChallenge(ORIGIN, 'expired "x"'), /error="invalid_token", error_description="expired x"/);
  assert.equal(bearerToken("Bearer abc.def-ghi"), "abc.def-ghi");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken(undefined), null);
});

test("the route requires a token on every POST, answers notifications with 202, and has no session or stream", () => {
  const route = read("app/mcp/route.ts");
  assert.match(route, /const token = bearerToken\(request\.headers\.get\("authorization"\)\);\s+if \(!token\) return unauthorized\(origin\);/);
  assert.match(route, /if \(!user\) return unauthorized\(origin, /);
  assert.match(route, /status: 401, headers: \{ \.\.\.BASE_HEADERS, "WWW-Authenticate": authChallenge\(origin, error\) \}/);
  assert.match(route, /if \(answer === null\) return new NextResponse\(null, \{ status: 202/);
  assert.match(route, /export function GET\(\) \{[\s\S]*?status: 405/);
  const data = read("lib/mcp/data.ts");
  assert.match(data, /return checkAccessToken\(\{/, "Auth is asked each time, so a removed connection stops at once");
  assert.match(route, /if \(user === "unavailable"\) \{[\s\S]*?status: 503, headers: \{ \.\.\.BASE_HEADERS, "Retry-After": "5" \}/, "an Auth outage asks to retry, not to reconnect");
  assert.match(data, /global: \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}/, "every statement runs as the person");
  assert.doesNotMatch(data, /SERVICE_ROLE|service_role|SUPABASE_SECRET/i, "no elevated key, ever");
  for (const path of ["app/.well-known/oauth-protected-resource/route.ts", "app/.well-known/oauth-protected-resource/mcp/route.ts"]) {
    assert.match(read(path), /protectedResourceMetadataResponse\(request\)/, path);
  }
});

test("the consent screen shows who asks, where the person returns, and warns about loopback apps", async () => {
  const { isAuthorizationId, redirectTarget, clientLabel } = await import("../lib/mcp/consent.mjs");
  assert.equal(isAuthorizationId("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), true);
  for (const bad of ["", "short", "x".repeat(201), "abc def ghi", "<script>", undefined]) assert.equal(isAuthorizationId(bad), false, String(bad));
  assert.deepEqual(redirectTarget("https://claude.ai/api/mcp/auth_callback"), { host: "claude.ai", loopback: false });
  assert.deepEqual(redirectTarget("https://chatgpt.com/connector_platform_oauth_redirect"), { host: "chatgpt.com", loopback: false });
  assert.deepEqual(redirectTarget("http://localhost:3118/callback"), { host: "localhost:3118", loopback: true });
  assert.deepEqual(redirectTarget("http://127.0.0.1:9/callback"), { host: "127.0.0.1:9", loopback: true });
  assert.deepEqual(redirectTarget("not a url"), { host: "", loopback: false });
  assert.equal(clientLabel("  Claude \n "), "Claude");
  assert.equal(clientLabel(""), null);
  assert.equal(clientLabel("x".repeat(200)).length, 80);

  const page = read("app/oauth/consent/page.tsx");
  assert.match(page, /if \(!user\) redirect\(`\/auth\/sign-in\?next=\$\{encodeURIComponent\(`\/oauth\/consent\?authorization_id=\$\{id\}`\)\}`\);/, "a signed-out person signs in and comes back to the same request");
  assert.match(page, /After you answer, you go back to \{host\}\./, "the redirect host is shown, as the MCP spec requires");
  assert.match(page, /target\.loopback &&/);
  const actions = read("app/oauth/consent/actions.ts");
  const body = actions.slice(actions.indexOf("export async function decideAuthorization"));
  assert.doesNotMatch(body.slice(body.indexOf("try {"), body.indexOf("} catch")), /redirect\(/, "redirect outside try");
  assert.match(read("lib/mcp/oauth-server.ts"), /skipBrowserRedirect: true/, "the server sends the person on, not the library");
  assert.match(read("app/app/connections/actions.ts"), /revokeGrant\(supabase, clientId\)/);
});

test("the guide, the menu and the privacy notice tell people what the assistant can and cannot do", () => {
  const guide = read("app/ai/page.tsx");
  assert.match(guide, /const SERVER_URL = "https:\/\/zavqera\.com\/mcp";/);
  for (const help of ["help.openai.com", "support.claude.com", "support.google.com/gemini"]) assert.ok(guide.includes(help), help);
  assert.match(guide, /id="privacy"/, "the consent screen links to #privacy");
  assert.match(read("components/shell.tsx"), /href="\/app\/connections"/);
  assert.match(read("components/shell.tsx"), /href="\/ai"/);
  assert.match(read("app/privacy/page.tsx"), /AI assistants you connect/);
  assert.match(read("app/robots.ts"), /"\/mcp", "\/oauth"/);
  assert.match(read("app/sitemap.ts"), /"\/ai"/);
});

test("the token is checked at Supabase Auth's userinfo endpoint for OAuth apps, and only falls back where it does not exist", async () => {
  const { checkAccessToken, readUserInfo, userInfoUrl } = await import("../lib/mcp/identity.mjs");
  const id = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  assert.equal(userInfoUrl("https://ref.supabase.co/"), "https://ref.supabase.co/auth/v1/oauth/userinfo");

  assert.deepEqual(readUserInfo(200, { sub: id.toUpperCase() }), { outcome: "user", id });
  for (const body of [null, {}, { sub: "" }, { sub: "not-a-uuid" }, { sub: 42 }]) assert.deepEqual(readUserInfo(200, body), { outcome: "rejected" }, JSON.stringify(body));
  for (const status of [400, 401, 403]) assert.deepEqual(readUserInfo(status, null), { outcome: "rejected" }, String(status));
  for (const status of [404, 405]) assert.deepEqual(readUserInfo(status, null), { outcome: "unsupported" }, String(status));
  for (const status of [429, 500, 502, 503]) assert.deepEqual(readUserInfo(status, null), { outcome: "unavailable" }, String(status));

  const calls = [];
  const answer = (status, body) => async (url, init) => {
    calls.push({ url, init });
    return { status, json: async () => { if (body instanceof Error) throw body; return body; } };
  };
  const base = { supabaseUrl: "https://ref.supabase.co", apiKey: "sb_publishable_test", token: "tok" };
  let fallbacks = 0;
  const fallback = async () => { fallbacks += 1; return { id }; };

  assert.deepEqual(await checkAccessToken({ ...base, fallback, fetchImpl: answer(200, { sub: id }) }), { id });
  assert.equal(calls[0].url, "https://ref.supabase.co/auth/v1/oauth/userinfo");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.equal(calls[0].init.headers.apikey, "sb_publishable_test");
  assert.equal(calls[0].init.cache, "no-store");
  assert.ok(calls[0].init.signal, "a slow Auth answer cannot hold the request open");

  assert.equal(await checkAccessToken({ ...base, fallback, fetchImpl: answer(403, null) }), null, "a removed connection is refused");
  assert.equal(await checkAccessToken({ ...base, fallback, fetchImpl: answer(401, null) }), null);
  assert.equal(await checkAccessToken({ ...base, fallback, fetchImpl: answer(200, new Error("bad json")) }), null, "an unreadable answer fails closed");
  assert.equal(await checkAccessToken({ ...base, fallback, fetchImpl: answer(503, null) }), "unavailable");
  assert.equal(await checkAccessToken({ ...base, fallback, fetchImpl: answer(429, null) }), "unavailable");
  assert.equal(await checkAccessToken({ ...base, fallback, fetchImpl: async () => { throw new Error("network"); } }), "unavailable");
  assert.equal(fallbacks, 0, "the fallback is never used while the userinfo endpoint answers");

  assert.deepEqual(await checkAccessToken({ ...base, fallback, fetchImpl: answer(404, null) }), { id }, "falls back only where the endpoint does not exist");
  assert.equal(fallbacks, 1);
  assert.equal(await checkAccessToken({ ...base, fallback: async () => { throw new Error("down"); }, fetchImpl: answer(404, null) }), "unavailable");
  assert.equal(await checkAccessToken({ ...base, fetchImpl: answer(404, null) }), "unavailable");

  let fetched = 0;
  assert.equal(await checkAccessToken({ ...base, token: "", fetchImpl: async () => { fetched += 1; } }), null);
  assert.equal(fetched, 0, "no token, no request");
});

test("signing out of the website keeps the person's AI assistant connections", () => {
  // Supabase's default sign-out scope is "global": it deletes every session of
  // the person, including the sessions of connected assistants (seen in
  // production on 25 Nov: a sign-out cut Claude's connection at once).
  const auth = read("components/auth-form.tsx");
  assert.match(auth, /auth\.signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(auth, /auth\.signOut\(\)/);
});

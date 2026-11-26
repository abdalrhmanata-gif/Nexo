import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicMissionSnapshot, remixQuery, shareIdOrNull, shareMessage, shareTargets } from "../lib/mission-share.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const mission = {
  name: "Find growth opportunities",
  intent: "Find five realistic ways for the bakery to grow this quarter.",
  criteria: ["Five opportunities", "Each with a first step"],
  completedSteps: ["List current customers", "Compare three competitors"],
  status: "COMPLETED",
  progress: 100,
  outcome: {
    status: "COMPLETED",
    successScore: 0.9,
    result: {
      summary: "Wholesale to two cafes looks strongest.",
      owner_email: "owner@example.com",
      workspace: "3f2c9a1e-0000-4000-8000-000000000000",
      "user id": "abc",
      nested: { secret: "x" },
      count: 5,
    },
  },
};

test("a shared snapshot carries the mission and its result, and nothing that names a person or a workspace", () => {
  const snapshot = publicMissionSnapshot(mission);
  assert.equal(snapshot.name, mission.name);
  assert.deepEqual(snapshot.criteria, mission.criteria);
  assert.deepEqual(snapshot.outcome.result, { summary: "Wholesale to two cafes looks strongest.", count: 5 });
  const text = JSON.stringify(snapshot);
  for (const leak of ["owner@example.com", "3f2c9a1e", "abc", "secret"]) assert.equal(text.includes(leak), false, leak);
  assert.deepEqual(Object.keys(snapshot).sort(), ["completedSteps", "criteria", "intent", "name", "outcome", "plannedSteps", "progress", "status"]);
});

test("a snapshot is bounded, whatever the mission holds", () => {
  const snapshot = publicMissionSnapshot({
    ...mission,
    name: "n".repeat(500),
    intent: "i".repeat(5000),
    criteria: Array.from({ length: 40 }, (_, index) => `criterion ${index} ${"c".repeat(400)}`),
    completedSteps: Array.from({ length: 40 }, (_, index) => `step ${index}`),
    progress: 250,
    outcome: { status: "COMPLETED", successScore: 7, result: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, "v".repeat(900)])) },
  });
  assert.equal(snapshot.name.length, 100);
  assert.equal(snapshot.intent.length, 700);
  assert.equal(snapshot.criteria.length, 6);
  assert.equal(snapshot.completedSteps.length, 20);
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.outcome.successScore, 1);
  assert.equal(Object.keys(snapshot.outcome.result).length, 4);
  assert.ok(JSON.stringify(snapshot).length < 8000);
});

test("something that is not a mission is not shared", () => {
  for (const bad of [null, undefined, "x", {}, { name: "a" }, { name: 3, intent: "b" }]) assert.equal(publicMissionSnapshot(bad), null);
  const withoutOutcome = publicMissionSnapshot({ name: "A", intent: "B", outcome: { status: "MAYBE", successScore: 1, result: {} } });
  assert.equal(withoutOutcome.outcome, undefined);
});

test("a remix starts a draft with one criterion and one step per line", () => {
  const query = new URLSearchParams(remixQuery(publicMissionSnapshot(mission)));
  assert.equal(query.get("name"), mission.name);
  assert.equal(query.get("criteria"), "Five opportunities\nEach with a first step");
  assert.equal(query.get("actions"), "List current customers\nCompare three competitors");
  assert.equal(query.get("criteria").includes("\\n"), false, "a real line break, not the two characters backslash and n");
});

test("a share id is a UUID or nothing", () => {
  assert.equal(shareIdOrNull("3F2C9A1E-0000-4000-8000-000000000000"), "3f2c9a1e-0000-4000-8000-000000000000");
  for (const bad of ["", "abc", "../x", null, 5]) assert.equal(shareIdOrNull(bad), null);
});

test("the result is stored on the server, built there, and can be withdrawn", () => {
  const route = read("app/api/missions/[id]/share/route.ts");
  assert.match(route, /isTrustedSameOriginRequest\(request\)/);
  // The browser sends no content: the snapshot is built from the mission the
  // signed-in person can read, then filtered.
  assert.match(route, /repository\.getMission\(/);
  assert.match(route, /publicMissionSnapshot\(/);
  assert.doesNotMatch(route, /request\.json\(\)/);
  assert.match(route, /rpc\("create_mission_share"/);
  assert.match(route, /rpc\("revoke_mission_share"/);
  // The page that anyone can open reads only that stored snapshot.
  const page = read("app/share/m/[id]/page.tsx");
  assert.match(page, /rpc\("get_mission_share"/);
  assert.doesNotMatch(page, /searchParams|atob\(/, "no result is ever taken from the link itself");
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});

test("anyone may read a share; only an editor of the mission's workspace may create or withdraw one", () => {
  const migration = read("../../supabase/migrations/20261116220000_mission_shares.sql");
  assert.match(migration, /create table if not exists private\.mission_shares \(/);
  assert.match(migration, /private\.can_edit_workspace\(v_workspace_id\)/);
  assert.match(migration, /grant execute on function public\.get_mission_share\(uuid\) to anon, authenticated;/);
  assert.match(migration, /revoke all on function public\.create_mission_share\(uuid, jsonb\) from public, anon;/);
  assert.match(migration, /revoked_at is null/);
  assert.match(migration, /octet_length\(p_snapshot::text\) > 8000/);
});

test("a shared mission shows the steps still to do, by title only", () => {
  const snapshot = publicMissionSnapshot({ ...mission, plannedSteps: ["Call two suppliers", { title: "x", note: "private" }, "  ", ...Array.from({ length: 20 }, (_, index) => `later ${index} ${"s".repeat(300)}`)] });
  assert.equal(snapshot.plannedSteps[0], "Call two suppliers");
  assert.equal(snapshot.plannedSteps.length, 18);
  assert.ok(snapshot.plannedSteps.every((step) => typeof step === "string" && step.length <= 140));
  assert.ok(JSON.stringify(snapshot).length < 8000);
});

test("a remix carries the finished steps and then the ones still to do", () => {
  const query = new URLSearchParams(remixQuery(publicMissionSnapshot({ ...mission, plannedSteps: ["Call two suppliers"] })));
  assert.equal(query.get("actions"), "List current customers\nCompare three competitors\nCall two suppliers");
});

test("a link shared before planned steps existed still remixes", () => {
  const old = publicMissionSnapshot(mission);
  delete old.plannedSteps;
  assert.equal(new URLSearchParams(remixQuery(old)).get("actions"), "List current customers\nCompare three competitors");
});

test("the text sent with a shared link names the mission", () => {
  assert.equal(shareMessage("Open a pharmacy", "https://zavqera.com/share/m/x"), "Open a pharmacy\nhttps://zavqera.com/share/m/x");
  assert.equal(shareMessage("  ", "https://zavqera.com/share/m/x"), "https://zavqera.com/share/m/x");
});

test("each share target carries the Mission name and the link, encoded", () => {
  const url = "https://zavqera.com/share/m/abc";
  const targets = Object.fromEntries(shareTargets("Fornye pass & visum", url).map((target) => [target.id, new URL(target.href)]));
  assert.deepEqual(Object.keys(targets), ["gmail", "outlook", "whatsapp", "x", "linkedin", "facebook", "email"]);
  assert.equal(targets.gmail.host, "mail.google.com");
  assert.equal(targets.gmail.searchParams.get("su"), "Fornye pass & visum");
  assert.equal(targets.gmail.searchParams.get("body"), `Fornye pass & visum\n${url}`);
  assert.equal(targets.outlook.host, "outlook.live.com");
  assert.equal(targets.outlook.searchParams.get("subject"), "Fornye pass & visum");
  assert.equal(targets.outlook.searchParams.get("body"), `Fornye pass & visum\n${url}`);
  assert.equal(targets.email.protocol, "mailto:");
  assert.equal(targets.email.searchParams.get("subject"), "Fornye pass & visum");
  assert.equal(targets.email.searchParams.get("body"), `Fornye pass & visum\n${url}`);
  assert.equal(targets.whatsapp.searchParams.get("text"), `Fornye pass & visum\n${url}`);
  assert.equal(targets.x.searchParams.get("url"), url);
  assert.equal(targets.x.searchParams.get("text"), "Fornye pass & visum");
  assert.equal(targets.linkedin.searchParams.get("url"), url);
  assert.equal(targets.facebook.searchParams.get("u"), url);
  for (const id of ["gmail", "outlook", "whatsapp", "x", "linkedin", "facebook"]) assert.equal(targets[id].protocol, "https:");
});

test("a shared checklist keeps all its steps, and always fits what the database stores", async () => {
  const { MAX_SHARED_STEPS } = await import("../lib/mission-share.mjs");
  const eleven = publicMissionSnapshot({ ...mission, completedSteps: Array.from({ length: 7 }, (_, i) => `done ${i}`), plannedSteps: Array.from({ length: 4 }, (_, i) => `todo ${i}`) });
  assert.equal(eleven.completedSteps.length + eleven.plannedSteps.length, 11);
  const many = publicMissionSnapshot({ ...mission, completedSteps: Array.from({ length: 15 }, (_, i) => `done ${i}`), plannedSteps: Array.from({ length: 15 }, (_, i) => `todo ${i}`) });
  assert.equal(many.completedSteps.length + many.plannedSteps.length, MAX_SHARED_STEPS);
  assert.equal(many.completedSteps.length, 15);
  // Long Arabic steps: two bytes a letter, still under the 8000-byte limit.
  const arabic = "خطوة طويلة جدًا ".repeat(9).slice(0, 140);
  const heavy = publicMissionSnapshot({ ...mission, name: "ق".repeat(100), intent: "ن".repeat(700), criteria: Array.from({ length: 6 }, () => "م".repeat(180)), completedSteps: Array.from({ length: 10 }, () => arabic), plannedSteps: Array.from({ length: 10 }, () => arabic) });
  assert.ok(new TextEncoder().encode(JSON.stringify(heavy)).length <= 7600);
  assert.ok(heavy.completedSteps.length === 10, "done steps are kept before planned ones");
});

test("a signed-out visitor who uses a shared checklist signs up first and comes back by a short address", () => {
  const route = readFileSync(new URL("../app/share/m/[id]/remix/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!user\) \{/);
  assert.match(route, /signUp\.searchParams\.set\("next", `\/share\/m\/\$\{shareId\}\/remix`\)/);
  // The count and the draft come after sign-in.
  assert.ok(route.indexOf("if (!user)") < route.indexOf("record_mission_share_event"));
});

test("a shared page says where it came from, links home with a tag, and keeps notes and proof private", () => {
  const page = readFileSync(new URL("../app/share/m/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /utm_source=shared_checklist/);
  assert.match(page, /Made with ZAVQERA/);
  assert.match(page, /Use this checklist/);
  assert.doesNotMatch(page, /snapshot\.(notes|proof|evidence|assignee|owner)/);
});

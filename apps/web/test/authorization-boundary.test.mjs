import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryPath = join(webRoot, "lib", "supabase", "mission-repository.ts");
const serverPath = join(webRoot, "lib", "supabase", "server.ts");
const browserPath = join(webRoot, "lib", "supabase", "browser.ts");
const source = async (path) => readFile(path, "utf8");
const restrictedCredentialPattern = new RegExp(["service", "_role"].join(""));

const entities = [
  "workspaces",
  "missions",
  "mission_actions",
  "mission_events",
  "mission_verifications",
  "mission_outcomes",
];

function authenticatedReadFixture(sessionUserId, requestedOwnerId) {
  if (!sessionUserId) throw new Error("Authentication required.");
  const records = ["user-a", "user-b"].flatMap((ownerId) => entities.map((entity) => ({
    entity,
    owner_id: ownerId,
    id: `${entity}-${ownerId}`,
  })));
  void requestedOwnerId;
  return records.filter((record) => record.owner_id === sessionUserId);
}

test("authenticated owner can read all authoritative entities", () => {
  const records = authenticatedReadFixture("user-a");
  assert.deepEqual(records.map((record) => record.entity), entities);
  assert.ok(records.every((record) => record.owner_id === "user-a"));
});

test("unauthenticated authoritative reads are rejected", () => {
  assert.throws(() => authenticatedReadFixture(null), /Authentication required/);
});

test("cross-user reads cannot return another owner's data", () => {
  const records = authenticatedReadFixture("user-a", "user-b");
  assert.equal(records.length, entities.length);
  assert.ok(records.every((record) => record.owner_id === "user-a"));
});

test("client-supplied owner authority is ignored", () => {
  const records = authenticatedReadFixture("user-a", "user-b");
  assert.equal(records.length, entities.length);
  assert.equal(records.some((record) => record.owner_id === "user-b"), false);
});

test("server repository derives identity and scopes every authoritative read", async () => {
  const repository = await source(repositoryPath);
  const server = await source(serverPath);
  assert.match(repository, /supabase\.auth\.getUser\(\)/);
  assert.match(repository, /if \(error \|\| !user\) throw new Error\("Authentication required\."\)/);
  assert.match(repository, /ownedWorkspace\(supabase, user\.id\)/);
  assert.match(repository, /\.eq\("owner_id", userId\)/);
  assert.match(repository, /\.eq\("workspace_id", workspaceId\)/);
  assert.match(repository, /\.eq\("mission_id", missionId\)/);
  assert.match(server, /createServerClient\(supabaseUrl, supabasePublishableKey/);
  assert.doesNotMatch(server, restrictedCredentialPattern);
});

test("mission, action, verification, and outcome commands use authoritative boundaries", async () => {
  const repository = await source(repositoryPath);
  const missionRoute = await source(join(webRoot, "app", "api", "missions", "[id]", "route.ts"));
  const actionRoute = await source(join(webRoot, "app", "api", "missions", "[id]", "actions", "[actionId]", "route.ts"));
  const verificationRoute = await source(join(webRoot, "app", "api", "missions", "[id]", "verification", "route.ts"));
  const outcomeRoute = await source(join(webRoot, "app", "api", "missions", "[id]", "outcome", "route.ts"));

  assert.match(repository, /rpc\("transition_mission"/);
  assert.match(repository, /rpc\("update_mission_details"/);
  assert.match(repository, /rpc\("transition_mission_action"/);
  assert.match(repository, /rpc\("create_mission_verification"/);
  assert.match(repository, /rpc\("commit_verified_mission_outcome"/);
  assert.doesNotMatch(repository, /\.from\([^)]*\)\.update\(/);
  for (const route of [missionRoute, actionRoute, verificationRoute, outcomeRoute]) {
    assert.match(route, /createSupabaseMissionRepository/);
  }
});

test("browser and request boundaries do not authorize authoritative reads", async () => {
  const browser = await source(browserPath);
  const repository = await source(repositoryPath);
  assert.doesNotMatch(browser, /\.from\(/);
  assert.doesNotMatch(repository, restrictedCredentialPattern);

  const files = [
    "app/api/missions/[id]/route.ts",
    "app/api/missions/[id]/actions/[actionId]/route.ts",
    "app/api/missions/[id]/verification/route.ts",
    "app/api/missions/[id]/outcome/route.ts",
  ];
  for (const file of files) {
    const text = await source(join(webRoot, file));
    assert.doesNotMatch(text, /\b(owner_id|user_id)\b/);
    assert.doesNotMatch(text, restrictedCredentialPattern);
  }
});

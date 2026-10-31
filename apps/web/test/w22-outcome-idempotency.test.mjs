import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const migration = readFileSync(
  join(repositoryRoot, "supabase", "migrations", "20261031210000_w22_idempotent_verified_outcome_replay.sql"),
  "utf8",
);

test("W22 keeps outcome replay ahead of the VERIFYING-only first-commit guard", () => {
  assert.match(migration, /create or replace function private\.commit_verified_mission_outcome/);
  assert.match(migration, /language plpgsql\s+security definer\s+set search_path = pg_catalog, public/i);

  const missionLock = migration.indexOf("from public.missions\n   where id = p_mission_id\n   for update;");
  const verifiedCheck = migration.indexOf("if v_verification.status <> 'VERIFIED' then");
  const outcomeRead = migration.indexOf("into v_outcome");
  const replayReturn = migration.indexOf("if found then\n    return v_outcome;\n  end if;", outcomeRead);
  const verifyingGuard = migration.indexOf("if v_mission.status <> 'VERIFYING' then");
  const outcomeInsert = migration.indexOf("insert into public.mission_outcomes");

  assert.ok(migration.includes("v_mission.owner_id <> auth.uid()"), "mission replay must be bound to its exact owner");
  assert.ok(migration.includes("and owner_id = auth.uid()"), "verification replay must be bound to its exact owner");
  assert.ok(missionLock >= 0, "mission must be locked before replay resolution");
  assert.ok(verifiedCheck > missionLock, "the verification must belong to this mission and be VERIFIED");
  assert.ok(outcomeRead > verifiedCheck, "existing outcome lookup must follow verification checks");
  assert.ok(replayReturn > outcomeRead, "existing outcome must return without another write");
  assert.ok(verifyingGuard > replayReturn, "the VERIFYING guard must apply only to a first commit");
  assert.ok(outcomeInsert > verifyingGuard, "a new outcome is inserted only after first-commit guards");
  assert.ok(migration.includes("and mission_id = p_mission_id"), "replay lookup must remain bound to the requested mission");
});

test("W22 retains serialized first-commit and append-only event behavior", () => {
  assert.match(migration, /for update;/);
  assert.match(migration, /status not in \('COMPLETED', 'CANCELLED'\)/);
  assert.match(migration, /perform public\.transition_mission\(/);
  assert.match(migration, /perform public\.record_mission_event\(/);
  assert.equal((migration.match(/insert into public\.mission_outcomes/gi) ?? []).length, 1);
  assert.equal((migration.match(/perform public\.record_mission_event/gi) ?? []).length, 1);
});

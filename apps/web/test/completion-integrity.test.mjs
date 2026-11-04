import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(web, "..", "..");
const read = (file) => readFileSync(path.join(repo, file), "utf8");
const migration = read("supabase/migrations/20261001091146_w21_authoritative_completion_integrity.sql");
const transition = migration.split("revoke all on function public.transition_mission")[0];
const old = read("supabase/migrations/20260924200000_w8_lifecycle_integrity_provenance.sql")
  .split("create or replace function public.transition_mission(")[1]
  .split("create or replace function public.update_mission_details(")[0];
const outcome = read("supabase/migrations/20261001081755_w20_cancelled_action_completion_semantics.sql");

test("completion guard is the only change to the established transition body", () => {
  const withoutGuard = transition.replace(/  if p_to_status = 'COMPLETED' then[\s\S]*?(?=  update public.missions)/, "");
  assert.equal(withoutGuard.trim(), (`create or replace function public.transition_mission(${old}`).trim());
});

test("completion guard runs after auth, parent lock, ownership, version and lifecycle", () => {
  const ordered = ["AUTHENTICATION_REQUIRED", "for update", "MISSION_NOT_FOUND_OR_FORBIDDEN",
    "STALE_VERSION", "INVALID_MISSION_TRANSITION", "if p_to_status = 'COMPLETED'",
    "ALL_ACTIONS_MUST_BE_COMPLETED", "VERIFIED_OUTCOME_REQUIRED", "update public.missions", "record_mission_event"];
  let previous = -1;
  for (const part of ordered) {
    const index = transition.indexOf(part);
    assert.ok(index > previous, `${part} must follow prior checks`);
    previous = index;
  }
});

test("required work excludes only completed and cancelled actions", () => {
  assert.match(transition, /mission_id = v_mission\.id\s+and status not in \('COMPLETED', 'CANCELLED'\)/);
  assert.match(outcome, /status not in \('COMPLETED', 'CANCELLED'\)/);
});

test("outcome and passing verification must match both mission and owner", () => {
  for (const condition of ["v.id = o.verification_id", "o.mission_id = v_mission.id",
    "o.owner_id = v_mission.owner_id", "o.status = 'COMPLETED'", "o.verified is true",
    "v.mission_id = v_mission.id", "v.owner_id = v_mission.owner_id", "v.status = 'VERIFIED'"]) {
    assert.ok(transition.includes(condition), condition);
  }
});

test("W20 inserts its outcome before invoking guarded completion and preserves idempotency", () => {
  assert.ok(outcome.indexOf("return v_outcome;") < outcome.indexOf("insert into public.mission_outcomes"));
  assert.ok(outcome.indexOf("insert into public.mission_outcomes") < outcome.indexOf("perform public.transition_mission"));
  assert.doesNotMatch(migration, /create or replace function public.commit_verified_mission_outcome/);
});

test("authenticated insert cannot create an already-completed mission or fake version", () => {
  assert.match(migration, /create policy missions_initial_state on public.missions\s+as restrictive for insert to authenticated\s+with check \(status = 'DRAFT' and version = 1\)/);
  assert.doesNotMatch(migration, /drop policy|disable.*row level security|grant update/i);
});

test("action insertion serializes with completion and refuses a completed parent", () => {
  const trigger = migration.split("create or replace function public.guard_mission_action_insert()")[1];
  assert.match(trigger, /where id = new\.mission_id and owner_id = auth\.uid\(\)\s+for update/);
  assert.match(trigger, /if v_status = 'COMPLETED' then\s+raise exception 'MISSION_ALREADY_COMPLETED'/);
  assert.match(trigger, /before insert on public.mission_actions/);
});

test("RPC and trigger security stay pinned and least-privileged", () => {
  assert.equal((migration.match(/security definer\r?\nset search_path = pg_catalog, public/g) ?? []).length, 2);
  assert.match(migration, /revoke all on function public.transition_mission\(uuid, text, bigint\) from public, anon/);
  assert.match(migration, /grant execute on function public.transition_mission\(uuid, text, bigint\) to authenticated/);
  assert.match(migration, /revoke all on function public.guard_mission_action_insert\(\) from public, anon, authenticated/);
});

test("UI and HTTP use the guarded RPC and return readable completion rejections", () => {
  const repository = read("apps/web/lib/supabase/mission-repository.ts");
  const route = read("apps/web/app/api/missions/[id]/route.ts");
  assert.match(repository, /supabase.rpc\("transition_mission"/);
  assert.match(repository, /VERIFIED_OUTCOME_REQUIRED: "Commit a passing verified outcome/);
  assert.match(repository, /MISSION_ALREADY_COMPLETED:/);
  assert.match(route, /MissionMutationRejectedError[\s\S]*status: 422/);
  assert.match(route, /await repository.updateMission!/);
});

test("live matrix includes A-J, direct table paths, roles and full rollback cleanup", () => {
  const matrix = read("supabase/tests/w21_completion_matrix.sql");
  for (const id of "ABCDEFGHIJ") assert.ok(matrix.includes(`PASS ${id}:`), id);
  assert.match(matrix, /set local role authenticated/);
  assert.match(matrix, /PASS: completed INSERT rejected by RLS/);
  assert.match(matrix, /PASS: direct UPDATE\/outcome INSERT denied/);
  assert.match(matrix, /PASS: zero fixtures in all eight tables/);
  assert.match(matrix, /errcode='ZX022'/);
});

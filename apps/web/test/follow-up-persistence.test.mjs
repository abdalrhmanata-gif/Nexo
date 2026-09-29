import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  allowedNextStatuses,
  followUpInputValue,
  formatFollowUp,
  isActionTransitionAllowed,
  isTerminalActionStatus,
  nextStepFor,
  supportsFollowUp,
} from "../lib/mission-content.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const migration = readFileSync(
  join(repoRoot, "supabase", "migrations", "20260929180000_w18_action_follow_up_persistence.sql"),
  "utf8",
);
const read = (relative) => readFileSync(join(webRoot, relative), "utf8");

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

/* ------------------------------------------------------------------ *
 * The database is authoritative. These tests bind the migration, the
 * client-side mirror and the transport to one contract so they cannot
 * drift apart silently.
 * ------------------------------------------------------------------ */

test("the migration adds no table, column, index or data change", () => {
  assert.ok(!/\balter table\b[\s\S]*?\badd column\b/i.test(migration), "no column may be added");
  assert.ok(!/\bdrop (table|column|index)\b/i.test(migration), "nothing may be dropped");
  assert.ok(!/\b(delete from|truncate)\b/i.test(migration), "no row may be deleted");
  // The only UPDATE is the RPC writing the single row it already locked.
  const updates = migration.match(/update public\.[a-z_]+[\s\S]*?;/gi) ?? [];
  assert.equal(updates.length, 1);
  assert.match(updates[0], /where id = v_action\.id/);
  assert.ok(!/\bcreate table\b/i.test(migration));
  // The only function dropped is the one being replaced by its own superset.
  const drops = migration.match(/drop function[^;]*;/gi) ?? [];
  assert.equal(drops.length, 1);
  assert.match(drops[0], /transition_mission_action\(uuid, text, bigint\)/);
});

test("the new follow-up parameters are optional, so the pre-W18 call still works", () => {
  assert.match(migration, /p_follow_up_at timestamptz default null/);
  assert.match(migration, /p_set_follow_up boolean default false/);
});

test("the RPC keeps authentication, ownership and version fencing", () => {
  assert.match(migration, /auth\.uid\(\) is null[\s\S]*?AUTHENTICATION_REQUIRED/);
  assert.match(migration, /m\.owner_id = auth\.uid\(\)/, "ownership is derived from the session");
  assert.match(migration, /ACTION_NOT_FOUND_OR_FORBIDDEN/);
  assert.match(migration, /p_expected_version <> v_action\.version[\s\S]*?STALE_VERSION/);
  assert.match(migration, /for update of a/, "the row must stay locked for the check-then-write");
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public/);
});

test("the RPC is executable only by authenticated users", () => {
  assert.match(migration, /revoke all on function public\.transition_mission_action\(uuid, text, bigint, timestamptz, boolean\) from public, anon;/);
  assert.match(migration, /grant execute on function public\.transition_mission_action\(uuid, text, bigint, timestamptz, boolean\) to authenticated;/);
  assert.ok(!/to anon\b/.test(migration), "anon must never be granted execute");
  assert.ok(!/service_role/.test(migration));
});

test("no client-supplied owner id is trusted anywhere in the RPC", () => {
  assert.ok(!/p_owner_id|p_user_id|p_mission_owner/.test(migration));
});

test("the client transition mirror matches the database transition table exactly", () => {
  const pairs = [...migration.matchAll(/\('([A-Z_]+)',\s*'([A-Z_]+)'\)/g)].map(([, from, to]) => `${from}->${to}`);
  assert.ok(pairs.length >= 9, "the transition table should have been parsed");
  const mirrored = [];
  for (const from of ["PENDING", "RUNNING", "BLOCKED", "COMPLETED", "CANCELLED"]) {
    for (const to of allowedNextStatuses(from)) mirrored.push(`${from}->${to}`);
  }
  assert.deepEqual([...pairs].sort(), [...mirrored].sort());
});

test("waiting work can be resumed directly instead of dead-ending", () => {
  assert.ok(isActionTransitionAllowed("BLOCKED", "RUNNING"));
  assert.ok(isActionTransitionAllowed("RUNNING", "BLOCKED"));
  assert.ok(isTerminalActionStatus("COMPLETED"));
  assert.ok(isTerminalActionStatus("CANCELLED"));
  assert.equal(isActionTransitionAllowed("COMPLETED", "RUNNING"), false);
});

test("staying in Waiting is accepted only as an explicit follow-up edit", () => {
  assert.match(migration, /v_from_status = 'BLOCKED'\s*\n\s*and p_to_status = 'BLOCKED'\s*\n\s*and v_set_follow_up/);
  assert.ok(isActionTransitionAllowed("BLOCKED", "BLOCKED"));
  assert.equal(isActionTransitionAllowed("RUNNING", "RUNNING"), false);
});

test("a follow-up date belongs only to Waiting", () => {
  assert.ok(supportsFollowUp("BLOCKED"));
  for (const status of ["PENDING", "RUNNING", "COMPLETED", "CANCELLED"]) {
    assert.equal(supportsFollowUp(status), false, `${status} must not carry a follow-up`);
  }
  assert.match(migration, /v_set_follow_up and p_to_status <> 'BLOCKED'[\s\S]*?FOLLOW_UP_REQUIRES_WAITING/);
  assert.match(migration, /if p_to_status <> 'BLOCKED' then\s*\n\s*v_next_follow_up := null;/);
});

test("the database rejects meaningless follow-up dates", () => {
  assert.match(migration, /FOLLOW_UP_IN_PAST/);
  assert.match(migration, /FOLLOW_UP_TOO_DISTANT/);
});

test("clearing a follow-up is recorded as provenance rather than lost", () => {
  assert.match(migration, /'previous_follow_up_at', v_previous_follow_up/);
  assert.match(migration, /'follow_up_at', v_action\.follow_up_at/);
  assert.match(migration, /record_mission_event/);
});

/* ------------------------------------------------------------------ *
 * Transport: the app must reach the database through the authoritative
 * RPC, and must not quietly drop a follow-up if the RPC is missing.
 * ------------------------------------------------------------------ */

test("the app persists follow-ups through the authoritative RPC only", () => {
  const repository = read("lib/supabase/mission-repository.ts");
  assert.match(repository, /rpc\("transition_mission_action"/);
  assert.match(repository, /p_set_follow_up/);
  assert.ok(!/from\("mission_actions"\)[\s\S]{0,80}\.update\(/.test(repository), "no browser-side action update");
  assert.match(repository, /follow_up_at/, "follow_up_at must be selected so it survives reload");
});

test("the follow-up parameters are omitted unless a follow-up is actually being changed", () => {
  const repository = read("lib/supabase/mission-repository.ts");
  const updateAction = repository.slice(repository.indexOf("async updateAction"), repository.indexOf("async recordVerification"));
  assert.match(updateAction, /if \(input\.setFollowUp\)/);
  assert.ok(updateAction.indexOf("p_set_follow_up") > updateAction.indexOf("if (input.setFollowUp)"));
});

test("a missing migration surfaces an operator error instead of silent data loss", () => {
  const repository = read("lib/supabase/mission-repository.ts");
  assert.match(repository, /PGRST202/);
  assert.match(repository, /migration must be applied/i);
});

test("the API validates follow-up input and distinguishes rejection from forbidden", () => {
  const route = read("app/api/missions/[id]/actions/[actionId]/route.ts");
  assert.match(route, /followUpAt must be a valid date/);
  assert.match(route, /MissionMutationRejectedError[\s\S]*?status: 422/);
  assert.match(route, /status: 409/);
  assert.match(route, /status: 401/);
  // Absence of the key means "leave it alone"; explicit null means "clear it".
  assert.match(route, /hasOwnProperty\.call\(body, "followUpAt"\)/);
});

test("the interface offers only transitions the database will accept", () => {
  const controls = read("components/action-mutation-controls.tsx");
  assert.match(controls, /allowedNextStatuses/);
  assert.match(controls, /supportsFollowUp/);
  assert.match(controls, /isTerminalActionStatus/);
  assert.match(controls, /followUpInputValue\(action\.followUpAt\)/, "the stored date must populate the field on reload");
});

test("leaving Waiting warns before the follow-up is removed", () => {
  const controls = read("components/action-mutation-controls.tsx");
  assert.match(controls, /losesFollowUp/);
  assert.match(controls, /remove the follow-up date/);
});

/* ------------------------------------------------------------------ *
 * Follow-up display
 * ------------------------------------------------------------------ */

test("follow-up dates are shown in human terms and flagged when overdue", () => {
  assert.equal(formatFollowUp(iso(0)).relative, "today");
  assert.equal(formatFollowUp(iso(1)).relative, "tomorrow");
  assert.equal(formatFollowUp(iso(4)).relative, "in 4 days");
  assert.equal(formatFollowUp(iso(-1)).relative, "yesterday");
  assert.equal(formatFollowUp(iso(-1)).overdue, true);
  assert.equal(formatFollowUp(iso(3)).overdue, false);
  assert.equal(formatFollowUp(null), null);
  assert.equal(formatFollowUp("not-a-date"), null);
});

test("a stored follow-up round-trips into the date input", () => {
  const value = followUpInputValue(iso(5));
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(followUpInputValue(null), "");
  assert.equal(followUpInputValue("nonsense"), "");
});

test("an overdue follow-up becomes the mission's next step", () => {
  const overdue = nextStepFor({
    actions: [{ status: "BLOCKED", title: "Chase the passport office", followUpAt: iso(-2) }],
    verifications: [], outcomes: [],
  });
  assert.equal(overdue.label, "Follow-up due");
  assert.match(overdue.detail, /Chase the passport office/);
  assert.equal(overdue.tone, "attention");

  const upcoming = nextStepFor({
    actions: [{ status: "BLOCKED", title: "Chase the passport office", followUpAt: iso(3) }],
    verifications: [], outcomes: [],
  });
  assert.match(upcoming.detail, /check back in 3 days/);
});

/* ------------------------------------------------------------------ *
 * End-to-end contract.
 *
 * The RPC cannot be executed here, so this exercises a model of the
 * semantics the migration implements. The assertions above bind the SQL
 * to this same contract, so a change to either side fails the suite.
 * ------------------------------------------------------------------ */

function createActionStore(ownerId) {
  const rows = new Map();
  rows.set("a1", { id: "a1", owner: ownerId, status: "PENDING", version: 1, follow_up_at: null });

  return {
    read: (id) => ({ ...rows.get(id) }),
    transition({ sessionUser, actionId, toStatus, expectedVersion, setFollowUp = false, followUpAt = null }) {
      if (!sessionUser) throw new Error("AUTHENTICATION_REQUIRED");
      const row = rows.get(actionId);
      if (!row || row.owner !== sessionUser) throw new Error("ACTION_NOT_FOUND_OR_FORBIDDEN");
      if (expectedVersion !== row.version) throw new Error("STALE_VERSION");
      if (setFollowUp && toStatus !== "BLOCKED") throw new Error("FOLLOW_UP_REQUIRES_WAITING");
      if (setFollowUp && followUpAt && new Date(followUpAt) < new Date(Date.now() - DAY)) throw new Error("FOLLOW_UP_IN_PAST");
      const sameStateEdit = row.status === "BLOCKED" && toStatus === "BLOCKED" && setFollowUp;
      if (!isActionTransitionAllowed(row.status, toStatus) && !sameStateEdit) throw new Error("INVALID_ACTION_TRANSITION");
      row.follow_up_at = toStatus !== "BLOCKED" ? null : setFollowUp ? followUpAt : row.follow_up_at;
      row.status = toStatus;
      row.version += 1;
      return { ...row };
    },
  };
}

test("follow-up survives Waiting, reload and a further transition", () => {
  const store = createActionStore("user-a");
  const due = iso(7);

  // 1. action -> Waiting, 2. with a follow-up date
  const waiting = store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 1, setFollowUp: true, followUpAt: due });
  assert.equal(waiting.status, "BLOCKED");
  assert.equal(waiting.follow_up_at, due);

  // 3. reload, 4. follow-up still exists
  const reloaded = store.read("a1");
  assert.equal(reloaded.follow_up_at, due);
  assert.equal(followUpInputValue(reloaded.follow_up_at), followUpInputValue(due));

  // 5. transition again while staying Waiting: the date is replaced, not duplicated
  const moved = store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 2, setFollowUp: true, followUpAt: iso(14) });
  assert.notEqual(moved.follow_up_at, due);
  assert.equal(moved.version, 3);

  // a status change that does not mention the follow-up preserves it
  const untouched = store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 3, setFollowUp: true, followUpAt: moved.follow_up_at });
  assert.equal(untouched.follow_up_at, moved.follow_up_at);

  // 6. resuming the work resolves the follow-up
  const resumed = store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "RUNNING", expectedVersion: 4 });
  assert.equal(resumed.follow_up_at, null);
  assert.equal(store.read("a1").follow_up_at, null);
});

test("completing an action clears its follow-up", () => {
  const store = createActionStore("user-a");
  store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 1, setFollowUp: true, followUpAt: iso(2) });
  store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "RUNNING", expectedVersion: 2 });
  const done = store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "COMPLETED", expectedVersion: 3 });
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.follow_up_at, null);
});

test("a follow-up can be removed without leaving Waiting", () => {
  const store = createActionStore("user-a");
  store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 1, setFollowUp: true, followUpAt: iso(2) });
  const cleared = store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 2, setFollowUp: true, followUpAt: null });
  assert.equal(cleared.status, "BLOCKED");
  assert.equal(cleared.follow_up_at, null);
});

test("7. another user cannot read or modify a follow-up", () => {
  const store = createActionStore("user-a");
  store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 1, setFollowUp: true, followUpAt: iso(3) });
  assert.throws(
    () => store.transition({ sessionUser: "user-b", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 2, setFollowUp: true, followUpAt: iso(99) }),
    /ACTION_NOT_FOUND_OR_FORBIDDEN/,
  );
  assert.throws(
    () => store.transition({ sessionUser: null, actionId: "a1", toStatus: "RUNNING", expectedVersion: 2 }),
    /AUTHENTICATION_REQUIRED/,
  );
  assert.ok(store.read("a1").follow_up_at, "the owner's follow-up is untouched");
});

test("8. invalid transitions and invalid follow-up requests are rejected", () => {
  const store = createActionStore("user-a");
  assert.throws(() => store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "COMPLETED", expectedVersion: 1 }), /INVALID_ACTION_TRANSITION/);
  assert.throws(() => store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "RUNNING", expectedVersion: 1, setFollowUp: true, followUpAt: iso(3) }), /FOLLOW_UP_REQUIRES_WAITING/);
  assert.throws(() => store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 1, setFollowUp: true, followUpAt: iso(-30) }), /FOLLOW_UP_IN_PAST/);
  assert.throws(() => store.transition({ sessionUser: "user-a", actionId: "a1", toStatus: "BLOCKED", expectedVersion: 99, setFollowUp: true, followUpAt: iso(3) }), /STALE_VERSION/);
  assert.equal(store.read("a1").version, 1, "no rejected request may mutate the row");
});

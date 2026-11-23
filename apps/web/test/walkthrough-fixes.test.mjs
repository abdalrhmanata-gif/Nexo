import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { formatFollowUp, humaniseEventType } from "../lib/mission-content.mjs";

// Found by using the product end to end on production, 23 Nov 2026, in the
// Arabic interface. Each test names what a person actually saw.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("a failed new-mission form keeps what was typed", () => {
  // Seen: one missing field sent the person back to an empty form.
  const page = read("app/app/missions/new/page.tsx");
  assert.match(page, /new URLSearchParams\(\{ error: "validation", name, intent, criteria, actions: steps \}\)/);
  assert.match(page, /defaultValue=\{params\.name \?\? ""\}/);
});

test("the create button cannot be pressed twice", () => {
  // Seen: two identical "reise" and two "fornye pass mitt" missions.
  assert.match(read("app/app/missions/new/page.tsx"), /PendingSubmitButton/);
  assert.match(read("components/pending-submit-button.tsx"), /disabled=\{pending\}/);
});

test("cancelled steps do not count as done", () => {
  // Seen: "0 of 3 actions complete" beside "33%".
  const repository = read("lib/supabase/mission-repository.ts");
  assert.match(repository, /Math\.round\(\(completed \/ live\.length\) \* 100\)/);
  assert.doesNotMatch(repository, /resolved \/ actions\.length/);
});

test("overdue counts use the Arabic forms for 2 and 3 to 10", () => {
  // Seen: "مستحق قبل 3 يوماً".
  const now = new Date(2026, 10, 23, 12);
  const daysAgo = (n) => new Date(2026, 10, 23 - n, 12).toISOString();
  const keys = [];
  const t = (key) => { keys.push(key); return key; };
  formatFollowUp(daysAgo(2), now, t);
  formatFollowUp(daysAgo(3), now, t);
  formatFollowUp(daysAgo(12), now, t);
  assert.deepEqual(keys, ["2 days ago", "{days} days ago|few", "{days} days ago"]);
  // English never shows the context marker.
  assert.equal(formatFollowUp(daysAgo(4), now).relative, "4 days ago");
  const dictionary = read("lib/i18n.ts");
  assert.match(dictionary, /"\{days\} days ago\|few":"منذ \{days\} أيام"/);
  assert.match(dictionary, /"2 days ago":"منذ يومين"/);
});

test("activity entries are named for what happened", () => {
  // Seen: "Action status transition — RUNNING to COMPLETED" in English.
  assert.equal(humaniseEventType("ACTION_STATUS_TRANSITION"), "Step status changed");
  assert.equal(humaniseEventType("MISSION_STATUS_TRANSITION"), "Mission status changed");
  assert.match(read("app/app/missions/[id]/page.tsx"), /statusWord\(item\.label, item\.fromStatus, t\)/);
});

test("the comparison page does not claim proof on each step", () => {
  // Evidence is recorded per mission, against its criteria, not per step.
  assert.doesNotMatch(read("lib/compare.ts"), /(proof|evidence)[^"]*each step|each step[^"]*(proof|evidence)/i);
});

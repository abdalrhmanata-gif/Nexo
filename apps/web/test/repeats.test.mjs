import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { describeRepeat, isTimeZoneName, parseRepeatForm, repeatAllowance, repeatErrorReason, REPEAT_NOTICES } from "../lib/repeats.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const form = (values) => [
  (name) => (Array.isArray(values[name]) ? values[name][0] : values[name]) ?? "",
  (name) => (Array.isArray(values[name]) ? values[name] : values[name] ? [values[name]] : []),
];

test("the allowance matches the database and the pricing page", () => {
  assert.equal(repeatAllowance("free"), 1);
  assert.equal(repeatAllowance(undefined), 1);
  assert.equal(repeatAllowance("plus"), 3);
  assert.equal(repeatAllowance("pro"), 100);
  assert.equal(repeatAllowance("scale"), 100);
  const migration = read("../../supabase/migrations/20261127090000_repeating_checklists.sql");
  assert.match(migration, /when 'pro' then 100 when 'scale' then 100 when 'plus' then 3 else 1 end/);
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /Free runs 1 repeating checklist, Plus 3, Pro and Scale up to 100/);
});

test("the form is read strictly: frequency, days and a real time zone", () => {
  const daily = parseRepeatForm(...form({ frequency: "daily", weekdays: ["5", "1", "1", "9", "x"], timeZone: "Europe/Oslo" }));
  assert.deepEqual(daily, { ok: true, rule: { frequency: "daily", weekdays: [1, 5], weekday: null, monthDay: null, timeZone: "Europe/Oslo" } });
  assert.deepEqual(parseRepeatForm(...form({ frequency: "daily", timeZone: "UTC" })), { ok: false, reason: "no-days" });
  assert.equal(parseRepeatForm(...form({ frequency: "weekly", weekday: "3", timeZone: "America/Argentina/Buenos_Aires" })).rule.weekday, 3);
  assert.deepEqual(parseRepeatForm(...form({ frequency: "weekly", weekday: "8" })), { ok: false, reason: "rule" });
  assert.equal(parseRepeatForm(...form({ frequency: "monthly", monthDay: "31" })).rule.monthDay, 31);
  assert.deepEqual(parseRepeatForm(...form({ frequency: "yearly" })), { ok: false, reason: "rule" });
  // An unreadable time zone falls back to UTC rather than failing the form.
  assert.equal(parseRepeatForm(...form({ frequency: "monthly", monthDay: "1", timeZone: "'; drop table x; --" })).rule.timeZone, "UTC");
  assert.ok(isTimeZoneName("Asia/Riyadh"));
  assert.ok(!isTimeZoneName("../etc/passwd"));
});

test("a repeat is described in words that are in every dictionary", () => {
  assert.equal(describeRepeat({ frequency: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] }).key, "Repeats every day");
  assert.equal(describeRepeat({ frequency: "daily", weekdays: [5, 4, 3, 2, 1] }).key, "Repeats every weekday, Monday to Friday");
  assert.deepEqual(describeRepeat({ frequency: "daily", weekdays: [6, 7] }).days, ["Saturday", "Sunday"]);
  assert.equal(describeRepeat({ frequency: "weekly", weekday: 1 }).day, "Monday");
  assert.equal(describeRepeat({ frequency: "monthly", monthDay: 31 }).key, "Repeats every month, on the last day");
  assert.deepEqual(describeRepeat({ frequency: "monthly", monthDay: 15 }).values, { day: "15" });
  const dictionaries = read("lib/i18n.ts");
  const keys = ["Repeats every day", "Repeats every weekday, Monday to Friday", "Repeats on {days}", "Repeats every week, starting on {day}",
    "Repeats every month, on the last day", "Repeats every month, on day {day}", "Monday", "Sunday", ...Object.values(REPEAT_NOTICES)];
  for (const key of keys) assert.equal(dictionaries.split(`${JSON.stringify(key)}:`).length - 1, 5, `"${key}" in all five dictionaries`);
});

test("the database's refusals become notices the page can show", () => {
  assert.equal(repeatErrorReason("REPEAT_LIMIT_REACHED"), "limit");
  assert.equal(repeatErrorReason("ERROR: REPEAT_NEEDS_STEPS"), "no-steps");
  assert.equal(repeatErrorReason("REPEAT_ALREADY_SET"), "already");
  assert.equal(repeatErrorReason("INVALID_TIME_ZONE"), "rule");
  assert.equal(repeatErrorReason("anything else"), "failed");
  for (const reason of ["limit", "no-steps", "too-many-steps", "already", "rule", "failed", "set", "stopped", "no-days"]) assert.ok(REPEAT_NOTICES[reason], reason);
});

test("the database keeps repeats safe: functions only, one run per period, editors only", () => {
  const sql = read("../../supabase/migrations/20261127090000_repeating_checklists.sql");
  // Read by workspace members; written only through the functions.
  assert.match(sql, /revoke all on public\.mission_repeats, public\.mission_repeat_runs from anon, authenticated;/);
  assert.match(sql, /grant select on public\.mission_repeats, public\.mission_repeat_runs to authenticated;/);
  assert.doesNotMatch(sql, /for (insert|update|delete) to authenticated/);
  // One run per period, even when two people open the app at once.
  assert.match(sql, /primary key \(repeat_id, period\)/);
  assert.match(sql, /on conflict \(repeat_id, period\) do nothing;/);
  // Viewers never make runs, and one failing repeat never stops the page.
  assert.match(sql, /if not private\.can_edit_workspace\(v_repeat\.workspace_id, v_user\) then continue; end if;/);
  assert.match(sql, /exception when others then/);
  // Step owners are kept only if they can still edit the workspace.
  assert.match(sql, /private\.can_edit_workspace\(v_repeat\.workspace_id, v_assignee\)/);
  // Nothing existing is altered or dropped.
  assert.doesNotMatch(sql, /alter table public\.(missions|mission_actions)|drop table/i);
});

test("the workspace makes today's runs before reading the list, and the mission page offers the repeat to editors", () => {
  const workspace = read("app/app/page.tsx");
  assert.ok(workspace.indexOf("await runDueRepeats()") < workspace.indexOf("repository.listMissions()"));
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /can\.canEdit && <RepeatBox/);
  // The assistants' tools are not part of this change.
  assert.doesNotMatch(read("lib/mcp/data.ts"), /repeat/i);
});

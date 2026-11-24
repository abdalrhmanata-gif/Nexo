import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CALENDAR_LIMITS,
  addDays,
  buildCalendarFeed,
  calendarLimit,
  countdown,
  daysBetween,
  foldLine,
  icsText,
  isPlanDate,
  lateSteps,
  nextDated,
  subscribeLinks,
  todayIn,
} from "../lib/plan-dates.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const readRepo = (path) => readFileSync(join(repoRoot, path), "utf8");
const MIGRATION = "supabase/migrations/20261124190000_plan_dates_and_calendar.sql";

test("the calendar carries 1 Mission on Free, 3 on Plus, every one on Pro and Scale, as the database does", () => {
  assert.deepEqual({ ...CALENDAR_LIMITS }, { free: 1, plus: 3, pro: null, scale: null });
  assert.equal(calendarLimit("free"), 1);
  assert.equal(calendarLimit("plus"), 3);
  assert.equal(calendarLimit("pro"), null);
  assert.equal(calendarLimit("scale"), null);
  assert.equal(calendarLimit("anything else"), 1, "an unknown plan is Free");
  const sql = readRepo(MIGRATION);
  assert.match(sql, /when 'pro' then 200\s+when 'scale' then 200\s+when 'plus' then 3\s+else 1/);
});

test("only real dates between 2000 and 2100 are plan dates", () => {
  for (const good of ["2027-03-01", "2028-02-29", "2000-01-01", "2100-12-31"]) assert.equal(isPlanDate(good), true, good);
  for (const bad of ["2027-02-29", "2027-13-01", "1999-12-31", "2101-01-01", "2027-3-1", "01/03/2027", "", null, 20270301]) {
    assert.equal(isPlanDate(bad), false, String(bad));
  }
});

test("date arithmetic is in whole calendar days, across months, years and clock changes", () => {
  assert.equal(daysBetween("2027-03-27", "2027-03-29"), 2, "over the European clock change");
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(addDays("2027-02-20", 14), "2027-03-06");
  assert.equal(addDays("2028-02-20", 14), "2028-03-05", "leap year");
  assert.deepEqual(countdown("2027-03-01", "2027-02-27"), { kind: "future", days: 2 });
  assert.deepEqual(countdown("2027-03-01", "2027-03-01"), { kind: "today", days: 0 });
  assert.deepEqual(countdown("2027-03-01", "2027-03-04"), { kind: "past", days: 3 });
  const late = new Date("2026-11-24T23:30:00Z");
  assert.equal(todayIn("UTC", late), "2026-11-24");
  assert.equal(todayIn("Europe/Oslo", late), "2026-11-25", "the reader's own today");
  assert.equal(todayIn("Not/AZone", late), "2026-11-24", "an unknown zone falls back to UTC");
});

test("late and next steps count only open steps", () => {
  const actions = [
    { id: "a", status: "PENDING" },
    { id: "b", status: "COMPLETED" },
    { id: "c", status: "BLOCKED" },
    { id: "d", status: "RUNNING" },
    { id: "e", status: "CANCELLED" },
  ];
  const due = { a: { dueOn: "2027-01-10" }, b: { dueOn: "2027-01-01" }, c: { dueOn: "2027-01-05" }, d: { dueOn: "2027-02-01" }, e: { dueOn: "2027-01-02" } };
  assert.deepEqual(lateSteps(actions, due, "2027-01-15").map((action) => action.id), ["c", "a"]);
  assert.equal(nextDated(actions, due, "2027-01-15").id, "d");
  assert.equal(nextDated(actions, due, "2027-03-01"), null);
});

test("calendar text is escaped and folded as RFC 5545 asks, without breaking a character", () => {
  assert.equal(icsText("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
  const arabic = `SUMMARY:${"حجز موعد تسجيل السكن ".repeat(8)}`;
  const folded = foldLine(arabic);
  const encoder = new TextEncoder();
  for (const line of folded.split("\r\n")) assert.ok(encoder.encode(line).length <= 75, `line of ${encoder.encode(line).length} octets`);
  assert.equal(folded.split("\r\n").map((line, index) => (index ? line.slice(1) : line)).join(""), arabic, "unfolding gives back the same text");
  assert.equal(foldLine("SHORT:x"), "SHORT:x");
});

const ROWS = [
  { mission_id: "m1", objective: "Move to Germany\n\nGet set up.", target_date: "2027-03-01", action_id: null, action_title: null, action_status: null, due_on: null, basis: null, action_position: null },
  { mission_id: "m1", objective: "Move to Germany", target_date: "2027-03-01", action_id: "s1", action_title: "Book the Anmeldung; bring ID, lease", action_status: "PENDING", due_on: "2027-03-15", basis: "law", action_position: 1 },
  { mission_id: "m1", objective: "Move to Germany", target_date: "2027-03-01", action_id: "s0", action_title: "Get the landlord's confirmation", action_status: "COMPLETED", due_on: "2027-02-20", basis: null, action_position: 0 },
  { mission_id: "m1", objective: "Move to Germany", target_date: "2027-03-01", action_id: "bad", action_title: "No date", action_status: "PENDING", due_on: null, basis: null, action_position: 2 },
];

function parse(feed) {
  assert.ok(feed.endsWith("\r\n"));
  assert.doesNotMatch(feed.replace(/\r\n/g, ""), /\n/, "every line ends in CRLF");
  const lines = feed.split("\r\n").slice(0, -1).reduce((all, line) => {
    if (line.startsWith(" ")) all[all.length - 1] += line.slice(1);
    else all.push(line);
    return all;
  }, []);
  const events = [];
  let current = null;
  let depth = 0;
  for (const line of lines) {
    if (line.startsWith("BEGIN:")) depth += 1;
    if (line.startsWith("END:")) depth -= 1;
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT") { events.push(current); current = null; }
    else if (current) current.push(line);
  }
  assert.equal(depth, 0, "every BEGIN has its END");
  return { lines, events };
}

test("the feed is a valid calendar: one all-day event per date, stable UIDs, reminders only where useful", () => {
  const { lines, events } = parse(buildCalendarFeed(ROWS, { now: new Date("2026-11-24T12:00:00Z") }));
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  for (const header of ["VERSION:2.0", "PRODID:-//ZAVQERA//Plan calendar//EN", "METHOD:PUBLISH", "X-WR-CALNAME:ZAVQERA"]) assert.ok(lines.includes(header), header);
  assert.equal(events.length, 3, "the step without a date is left out");
  for (const event of events) {
    for (const field of ["UID:", "DTSTAMP:20261124T120000Z", "DTSTART;VALUE=DATE:", "DTEND;VALUE=DATE:", "SUMMARY:"]) {
      assert.ok(event.some((line) => line.startsWith(field)), `${field} in ${event[0]}`);
    }
  }
  const [first, target, legal] = events;
  assert.ok(first.includes("UID:step-s0@zavqera.com"), "sorted by date");
  assert.ok(first.includes("SUMMARY:✓ Get the landlord's confirmation"), "a done step is marked done");
  assert.ok(!first.includes("BEGIN:VALARM"), "no reminder for a done step");
  assert.ok(target.includes("UID:target-m1@zavqera.com"));
  assert.ok(target.includes("SUMMARY:🎯 Move to Germany"), "the Mission's name, not its whole objective");
  assert.ok(target.includes("DTSTART;VALUE=DATE:20270301") && target.includes("DTEND;VALUE=DATE:20270302"));
  assert.ok(legal.includes("SUMMARY:Book the Anmeldung\\; bring ID\\, lease"), "escaped");
  assert.ok(legal.some((line) => line.startsWith("DESCRIPTION:") && line.includes("Deadline set by law")));
  assert.ok(legal.includes("BEGIN:VALARM") && legal.includes("TRIGGER:-PT15H"), "09:00 the day before");
  assert.ok(legal.some((line) => line.includes("https://zavqera.com/app/missions/m1")));
  assert.equal(parse(buildCalendarFeed([])).events.length, 0, "an empty link is a valid, empty calendar");
});

test("the subscribe links open each calendar on the same private feed", () => {
  const links = subscribeLinks("https://zavqera.com/api/calendar/" + "a".repeat(64) + ".ics");
  assert.equal(links.webcal, "webcal://zavqera.com/api/calendar/" + "a".repeat(64) + ".ics");
  assert.equal(links.google, `https://calendar.google.com/calendar/render?cid=${links.webcal}`);
  assert.match(links.outlook, /^https:\/\/outlook\.live\.com\/calendar\/0\/addfromweb\?url=https%3A%2F%2Fzavqera\.com%2Fapi%2Fcalendar%2Fa{64}\.ics&name=ZAVQERA$/);
});

test("the database owns the rules: owner writes, members read, steps stay in their Mission, the link is closed", () => {
  const sql = readRepo(MIGRATION);
  assert.doesNotMatch(sql, /\b(drop table|drop column|delete from|truncate|alter table public\.(missions|mission_actions))\b/i, "additive only; core tables untouched");
  assert.match(sql, /mission_schedules_read on public\.mission_schedules\s+for select to authenticated using \(private\.can_read_mission\(mission_id\)\)/);
  assert.match(sql, /mission_schedules_insert_owner on public\.mission_schedules\s+for insert to authenticated with check \(private\.owns_mission\(mission_id\)\)/);
  assert.match(sql, /with check \(private\.owns_mission\(mission_id\) and private\.action_in_mission\(action_id, mission_id\)\)/);
  assert.match(sql, /grant update \(due_on, basis\) on public\.action_due_dates to authenticated/, "a date cannot be moved to another Mission");
  assert.match(sql, /revoke all on public\.calendar_feeds from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant [^;]* on public\.calendar_feeds/);
  assert.match(sql, /grant execute on function public\.calendar_feed_events\(text\) to anon, authenticated/);
  assert.match(sql, /if p_token is null or p_token !~ '\^\[0-9a-f\]\{64\}\$' then/);
  assert.match(sql, /where a\.status <> 'CANCELLED'/);
  assert.match(sql, /limit private\.calendar_mission_limit_for\(v_owner\)/, "the plan is applied when the feed is read, too");
  assert.match(sql, /added_at timestamptz not null default clock_timestamp\(\)/, "found on Development, 24 Nov: now() ties Missions added together");
  assert.match(sql, /on delete cascade/);
});

test("the CI proof runs every check against the real migrations", () => {
  assert.match(readRepo(".github/workflows/zavqera-opportunity-isolation.yml"), /\.\/tool\/plan_dates_calendar_proof\.sh/);
  const proof = readRepo("tool/plan_dates_calendar_proof.sh");
  for (const check of ["a step cannot be dated under another Mission", "an outsider reads no dates", "a member cannot change or remove the owner's dates",
    "nobody reads the link table directly", "Free carries one Mission", "the feed has the target date and the live step, not the cancelled one",
    "a malformed link returns nothing", "after a downgrade to Free only the first Mission added stays", "the old link stops working at once", "nothing is left behind"]) {
    assert.ok(proof.includes(check), check);
  }
});

test("the legal deadline is the law's, with its source, and only for the guide step it applies to", () => {
  const deadlines = read("lib/legal-deadlines.ts");
  assert.match(deadlines, /guide: "moving-to-germany-checklist",\s+actionIndex: 1,[\s\S]*?days: 14,\s+source: "deRegistration"/);
  assert.match(read("lib/guides/sources.ts"), /deRegistration: "https:\/\/www\.gesetze-im-internet\.de\/bmg\/__17\.html"/, "§17 of the Federal Registration Act");
  // The step it attaches to is the Anmeldung step in every language.
  for (const lang of ["en", "ar", "es", "fr", "de", "nb"]) {
    const guide = read(`lib/guides/${lang}.ts`);
    const mission = guide.slice(guide.indexOf("mission:", guide.indexOf("moving-to-germany-checklist")));
    const actions = mission.slice(mission.indexOf("actions: ["), mission.indexOf("]", mission.indexOf("actions: [")));
    assert.match(actions.split('", "')[1] ?? "", /Anmeldung/, lang);
  }
  assert.match(deadlines, /guide\?\.mission\.actions\[deadline\.actionIndex\]\?\.trim\(\) === wanted/, "exact match: a renamed step gets no automatic deadline");
});

test("the calendar link is private: never cached by a shared cache, never indexed, empty when unknown", () => {
  const route = read("app/api/calendar/[file]/route.ts");
  assert.match(route, /const FILE = \/\^\(\[0-9a-f\]\{64\}\)\\\.ics\$\/;/);
  assert.match(route, /"Cache-Control": "private, no-store, max-age=0"/);
  assert.match(route, /"X-Robots-Tag": "noindex, nofollow"/);
  assert.match(route, /"Content-Type": "text\/calendar; charset=utf-8"/);
  assert.doesNotMatch(read("middleware.ts"), /api\/calendar/, "outside the sign-in middleware: calendars have no session");
});

test("every date action redirects outside its try, and law dates come only from the law", () => {
  const actions = read("app/app/calendar/actions.ts");
  for (const name of ["saveMissionDates", "addMissionToCalendar", "removeMissionFromCalendar", "replaceCalendarLink"]) {
    const start = actions.indexOf(`export async function ${name}(`);
    const next = actions.indexOf("export async function", start + 1);
    const body = actions.slice(start, next === -1 ? undefined : next);
    const catchAt = body.lastIndexOf("} catch");
    assert.doesNotMatch(body.slice(body.indexOf("try {"), catchAt), /redirect\(/, `${name} must not redirect inside try`);
    assert.match(body.slice(catchAt), /redirect\(target\);/, name);
  }
  assert.match(actions, /legalDeadlineForStep\(action\.title\) !== null/, "only a step the law applies to can be marked law");
  assert.match(actions, /changes\.push\(\{ actionId: action\.id, dueOn: legalDueDate\(deadline, from\), basis: "law" \}\)/);
});

test("the Mission page shows dates without ever breaking on them", () => {
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /dates = await readMissionDates\(mission\.id\);/);
  assert.match(page, /\} catch \{\s+calendar = null;\s+\}/);
  const repository = read("lib/supabase/plan-dates-repository.ts");
  assert.match(repository, /if \(schedule\.error \|\| due\.error\) return EMPTY;/);
  assert.match(repository, /\} catch \{\s+return EMPTY;\s+\}/);
});

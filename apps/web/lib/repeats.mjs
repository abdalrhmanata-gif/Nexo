// Repeating checklists: the rules the app checks before the database does,
// and the words that describe a repeat. The database
// (supabase/migrations/20261127090000_repeating_checklists.sql) is the
// authority; this module only keeps the form and the page honest.

export const REPEAT_FREQUENCIES = Object.freeze(["daily", "weekly", "monthly"]);

/** ISO weekdays, Monday first, with the English key each is shown under. */
export const WEEKDAYS = Object.freeze([
  { iso: 1, en: "Monday" },
  { iso: 2, en: "Tuesday" },
  { iso: 3, en: "Wednesday" },
  { iso: 4, en: "Thursday" },
  { iso: 5, en: "Friday" },
  { iso: 6, en: "Saturday" },
  { iso: 7, en: "Sunday" },
]);

/** How many repeats may run at once, by plan. Mirrors private.repeat_allowance(). */
export function repeatAllowance(plan) {
  if (plan === "pro" || plan === "scale") return 100;
  if (plan === "plus") return 3;
  return 1;
}

/** An IANA time zone name as browsers report it ("Europe/Oslo", "UTC"). */
export function isTimeZoneName(value) {
  return typeof value === "string" && value.length <= 64 && /^(UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2})$/.test(value);
}

const asInt = (value) => (typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : NaN);

/**
 * The repeat a form asks for, or the reason it cannot be set.
 * `fields` reads one value; `all` reads every value of a repeated field.
 */
export function parseRepeatForm(fields, all) {
  const frequency = fields("frequency");
  if (!REPEAT_FREQUENCIES.includes(frequency)) return { ok: false, reason: "rule" };
  const timeZone = isTimeZoneName(fields("timeZone")) ? fields("timeZone") : "UTC";
  if (frequency === "daily") {
    const weekdays = [...new Set(all("weekdays").map(asInt))].filter((day) => day >= 1 && day <= 7).sort((a, b) => a - b);
    if (!weekdays.length) return { ok: false, reason: "no-days" };
    return { ok: true, rule: { frequency, weekdays, weekday: null, monthDay: null, timeZone } };
  }
  if (frequency === "weekly") {
    const weekday = asInt(fields("weekday"));
    if (!(weekday >= 1 && weekday <= 7)) return { ok: false, reason: "rule" };
    return { ok: true, rule: { frequency, weekdays: null, weekday, monthDay: null, timeZone } };
  }
  const monthDay = asInt(fields("monthDay"));
  if (!(monthDay >= 1 && monthDay <= 31)) return { ok: false, reason: "rule" };
  return { ok: true, rule: { frequency, weekdays: null, weekday: null, monthDay, timeZone } };
}

/** The database's refusal, as the notice the page shows. */
export function repeatErrorReason(message) {
  const text = String(message ?? "");
  if (text.includes("REPEAT_LIMIT_REACHED")) return "limit";
  if (text.includes("REPEAT_NEEDS_STEPS")) return "no-steps";
  if (text.includes("REPEAT_TOO_MANY_STEPS")) return "too-many-steps";
  if (text.includes("REPEAT_ALREADY_SET")) return "already";
  if (text.includes("INVALID_TIME_ZONE") || text.includes("INVALID_REPEAT_RULE")) return "rule";
  return "failed";
}

/** The notices, as dictionary keys. */
export const REPEAT_NOTICES = Object.freeze({
  set: "This checklist now repeats. The next one appears on its own when its day comes.",
  stopped: "Repeating stopped. The checklists already made stay as they are.",
  limit: "Your plan's repeating checklists are all in use. Stop one, or move to a bigger plan.",
  "no-steps": "Add at least one step first: each new checklist starts with these steps.",
  "too-many-steps": "A repeating checklist can hold up to 50 steps.",
  already: "This checklist already repeats.",
  "no-days": "Choose at least one day.",
  rule: "Choose how often it repeats.",
  failed: "That did not work just now. Please try again.",
});

const DAILY_EVERY = "1,2,3,4,5,6,7";
const WEEKDAYS_ONLY = "1,2,3,4,5";

/**
 * A repeat in words: { key, values } for fill() after translation.
 * daily: "Every day", "Every weekday (Monday to Friday)", or the days listed;
 * weekly: "Every week, starting {day}"; monthly: "Every month, on day {day}".
 */
export function describeRepeat(repeat) {
  if (!repeat) return null;
  if (repeat.frequency === "daily") {
    const days = [...(repeat.weekdays ?? [])].sort((a, b) => a - b).join(",");
    if (days === DAILY_EVERY) return { key: "Repeats every day", values: {} };
    if (days === WEEKDAYS_ONLY) return { key: "Repeats every weekday, Monday to Friday", values: {} };
    return { key: "Repeats on {days}", values: {}, days: (repeat.weekdays ?? []).map((iso) => WEEKDAYS.find((day) => day.iso === iso)?.en).filter(Boolean) };
  }
  if (repeat.frequency === "weekly") {
    return { key: "Repeats every week, starting on {day}", values: {}, day: WEEKDAYS.find((day) => day.iso === repeat.weekday)?.en ?? "Monday" };
  }
  if (repeat.frequency === "monthly") {
    return repeat.monthDay >= 31
      ? { key: "Repeats every month, on the last day", values: {} }
      : { key: "Repeats every month, on day {day}", values: { day: String(repeat.monthDay) } };
  }
  return null;
}

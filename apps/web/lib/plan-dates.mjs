// Plan dates and the calendar feed: the pure part.
// The database (supabase/migrations/20261124190000_plan_dates_and_calendar.sql)
// enforces who may date what and how many Missions a calendar link carries;
// this module mirrors those numbers for the page, does the date arithmetic,
// and writes the iCalendar file (RFC 5545) that calendars subscribe to.

import { parseMissionObjective } from "./mission-content.mjs";

/** Missions one calendar link carries. null = every Mission (the database keeps 200 as a safeguard). */
export const CALENDAR_LIMITS = Object.freeze({ free: 1, plus: 3, pro: null, scale: null });

export function calendarLimit(plan) {
  return Object.prototype.hasOwnProperty.call(CALENDAR_LIMITS, plan) ? CALENDAR_LIMITS[plan] : CALENDAR_LIMITS.free;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date between 2000 and 2100, written YYYY-MM-DD, as the database accepts. */
export function isPlanDate(value) {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const toUtc = (iso) => {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

/** Today's date, YYYY-MM-DD, in a time zone (the reader's when known, else UTC). */
export function todayIn(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function daysBetween(fromIso, toIso) {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000);
}

export function addDays(iso, days) {
  return new Date(toUtc(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** { kind: "future" | "today" | "past", days } from today to a target date. */
export function countdown(targetIso, todayIso) {
  const days = daysBetween(todayIso, targetIso);
  if (days > 0) return { kind: "future", days };
  if (days === 0) return { kind: "today", days: 0 };
  return { kind: "past", days: -days };
}

const OPEN = new Set(["PENDING", "RUNNING", "BLOCKED"]);

/** Steps whose date has passed while they are still open, earliest first. */
export function lateSteps(actions, dueDates, todayIso) {
  return actions
    .filter((action) => OPEN.has(action.status) && dueDates[action.id] && dueDates[action.id].dueOn < todayIso)
    .sort((a, b) => dueDates[a.id].dueOn.localeCompare(dueDates[b.id].dueOn));
}

/** The open step with the nearest date from today on, or null. */
export function nextDated(actions, dueDates, todayIso) {
  return actions
    .filter((action) => OPEN.has(action.status) && dueDates[action.id] && dueDates[action.id].dueOn >= todayIso)
    .sort((a, b) => dueDates[a.id].dueOn.localeCompare(dueDates[b.id].dueOn))[0] ?? null;
}

// --- iCalendar (RFC 5545) ----------------------------------------------------

/** TEXT value escaping, RFC 5545 §3.3.11. */
export function icsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Content lines are at most 75 octets; longer ones fold with CRLF + space, never inside a character (§3.1). */
export function foldLine(line) {
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + width > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += width;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compactDate = (iso) => iso.replace(/-/g, "");
const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * The calendar for the rows public.calendar_feed_events returns: one all-day
 * event per Mission target date and per dated step. Event text is the
 * person's own words; the few fixed words are English, because a calendar
 * fetches the link without a session and so without a language.
 */
export function buildCalendarFeed(rows, { now = new Date(), origin = "https://zavqera.com" } = {}) {
  const events = [];
  for (const row of rows ?? []) {
    const name = parseMissionObjective(row.objective ?? "").name || "Mission";
    const link = `${origin}/app/missions/${row.mission_id}`;
    if (!row.action_id) {
      if (!row.target_date || !isPlanDate(row.target_date)) continue;
      events.push({
        date: row.target_date,
        order: -1,
        lines: [
          `UID:target-${row.mission_id}@zavqera.com`,
          `SUMMARY:${icsText(`🎯 ${name}`)}`,
          `DESCRIPTION:${icsText(`Target date of your Mission “${name}”.\nOpen it: ${link}`)}`,
        ],
        alarm: `Tomorrow: ${name}`,
      });
      continue;
    }
    if (!row.due_on || !isPlanDate(row.due_on)) continue;
    const done = row.action_status === "COMPLETED";
    const law = row.basis === "law";
    events.push({
      date: row.due_on,
      order: Number.isFinite(row.action_position) ? row.action_position : 0,
      lines: [
        `UID:step-${row.action_id}@zavqera.com`,
        `SUMMARY:${icsText(`${done ? "✓ " : ""}${row.action_title ?? ""}`)}`,
        `DESCRIPTION:${icsText(`A step of your Mission “${name}”.${law ? "\nDeadline set by law, from the official source in the ZAVQERA guide." : ""}\nOpen it: ${link}`)}`,
      ],
      alarm: done ? null : `Due tomorrow: ${row.action_title ?? ""}`,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZAVQERA//Plan calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ZAVQERA",
    `X-WR-CALDESC:${icsText("Your Mission dates from ZAVQERA.")}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  const dtstamp = stamp(now);
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      ...event.lines,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`,
      "TRANSP:TRANSPARENT",
    );
    if (event.alarm) {
      // 09:00 the day before, for all-day events (start at 00:00 minus 15 hours).
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(event.alarm)}`, "TRIGGER:-PT15H", "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Links that open a subscription in each calendar, from the https feed URL. */
export function subscribeLinks(feedUrl) {
  const webcal = feedUrl.replace(/^https:\/\//, "webcal://");
  return {
    feed: feedUrl,
    webcal,
    // Google's documented-by-use form takes the webcal URL as is; ours has only URL-safe characters.
    google: `https://calendar.google.com/calendar/render?cid=${webcal}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=ZAVQERA`,
  };
}

// --- Who fetched the link, and which device the reader is on -----------------

/**
 * Which kind of calendar app fetched the feed, from its User-Agent, or null
 * for a web browser (someone opening the link by hand is not a connection).
 * Apple: iOS "dataaccessd", macOS "CalendarAgent". Google: "Google-Calendar-Importer".
 */
export function calendarClientFromUserAgent(userAgent) {
  const ua = typeof userAgent === "string" ? userAgent : "";
  if (/Google-Calendar-Importer/i.test(ua)) return "google";
  if (/dataaccessd|CalendarAgent|iCal\/|DAVKit|\biOS\/\d|\bmacOS\/\d/i.test(ua)) return "apple";
  if (/Outlook|Microsoft Office|Exchange|MSOffice/i.test(ua)) return "outlook";
  if (/^Mozilla\/5\.0/.test(ua)) return null;
  return "other";
}

/** The reader's device, for showing the right calendar first. */
export function platformFromUserAgent(userAgent, maxTouchPoints = 0) {
  const ua = typeof userAgent === "string" ? userAgent : "";
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua)) return "mac";
  return "desktop";
}

/**
 * Hours without a fetch after which a calendar app counts as stopped. No
 * calendar app reports that a subscription was deleted, so silence is the
 * only signal; Google can leave a day between fetches, so three days leaves
 * room before saying it stopped.
 */
export const CONNECTION_FRESH_HOURS = 72;

const CALENDAR_CLIENTS = new Set(["apple", "google", "outlook", "other"]);

/**
 * The calendar apps that have fetched the link, newest first, split into
 * those still updating and those that stopped. One entry per app.
 */
export function calendarConnections(rows, now = new Date()) {
  const latest = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const at = Date.parse(row?.fetchedAt ?? "");
    if (!CALENDAR_CLIENTS.has(row?.client) || !Number.isFinite(at)) continue;
    if (!latest.has(row.client) || latest.get(row.client) < at) latest.set(row.client, at);
  }
  const cutoff = now.getTime() - CONNECTION_FRESH_HOURS * 60 * 60 * 1000;
  const sorted = [...latest].sort((a, b) => b[1] - a[1]);
  const view = ([client, at]) => ({ client, fetchedAt: new Date(at).toISOString() });
  return {
    active: sorted.filter(([, at]) => at >= cutoff).map(view),
    stopped: sorted.filter(([, at]) => at < cutoff).map(view),
  };
}

/** Whether an app fetched the link after a Mission was added to it. */
export function hasFetchedSince(fetchedAt, since) {
  const fetched = Date.parse(fetchedAt ?? "");
  const added = Date.parse(since ?? "");
  if (!Number.isFinite(added)) return true;
  return Number.isFinite(fetched) && fetched >= added;
}

import { buildCalendarFeed, calendarClientFromUserAgent } from "../../../../lib/plan-dates.mjs";
import { readCalendarFeed, recordCalendarFetch } from "../../../../lib/supabase/plan-dates-repository";

// A calendar link: https://zavqera.com/api/calendar/<token>.ics
// Google Calendar, Apple Calendar and Outlook fetch it on their own schedule,
// without a session; the token is the credential and the database checks it.
export const dynamic = "force-dynamic";

const FILE = /^([0-9a-f]{64})\.ics$/;

const HEADERS = {
  // Private data behind a secret link: never stored by a shared cache, never indexed.
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const match = FILE.exec((await params).file);
  if (!match) return new Response("Not found", { status: 404, headers: HEADERS });
  try {
    const rows = await readCalendarFeed(match[1]);
    // A calendar app (not a browser) fetched it: the page can now say
    // "Connected to Apple Calendar". Never fails the feed.
    const client = calendarClientFromUserAgent(request.headers.get("user-agent"));
    if (client) await recordCalendarFetch(match[1], client);
    // An unknown or replaced link answers with an empty calendar rather than an
    // error, so a calendar that still holds it simply shows nothing.
    return new Response(buildCalendarFeed(rows, { now: new Date(), origin: "https://zavqera.com" }), {
      status: 200,
      headers: {
        ...HEADERS,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="zavqera.ics"',
      },
    });
  } catch {
    return new Response("Calendar temporarily unavailable", { status: 503, headers: { ...HEADERS, "Retry-After": "600" } });
  }
}

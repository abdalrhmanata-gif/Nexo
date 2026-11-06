import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { COUNTED_ROUTES, normaliseReferrer, normaliseRoute } from "../../../lib/metrics-routes.mjs";

export const dynamic = "force-dynamic";

// Counting a page open. Nothing about the caller is read or stored: no IP, no
// session, no cookie, no user agent. The body carries a pathname and the
// referring site, both reduced to a fixed set before they reach the database,
// so this cannot be used to create rows or to record anything about a person.
//
// It always answers 204, whatever happened. A counter that breaks a page, or
// that tells a caller which routes exist, would be worse than no counter.
const DONE = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) return DONE;

    const body = await request.json().catch(() => ({})) as { path?: unknown; referrer?: unknown };
    const path = normaliseRoute(typeof body.path === "string" ? body.path : "");
    // "other" means the caller sent something we do not count. Recording it
    // would let anyone fill the table with noise under a single key, and tells
    // us nothing, so it is dropped.
    if (path === "other" || !COUNTED_ROUTES.includes(path) && path !== "/app/missions/[id]") return DONE;

    const selfHost = (() => {
      try { return new URL(request.url).hostname; } catch { return null; }
    })();
    const referrer = normaliseReferrer(typeof body.referrer === "string" ? body.referrer : "", selfHost);

    const supabase = await createSupabaseServerClient();
    await supabase.rpc("record_page_view", { p_path: path, p_referrer_host: referrer });
    return DONE;
  } catch {
    // Metrics must never be the reason something fails.
    return DONE;
  }
}

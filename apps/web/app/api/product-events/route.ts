import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { missionTemplateById } from "../../../lib/mission-templates";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ recorded: false }, { headers: { "Cache-Control": "no-store" } });
  let payload: unknown;
  try { payload = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid event payload." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid event payload." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const input = payload as { event_type?: unknown; template_id?: unknown };
  if (input.event_type !== "template_shared" || typeof input.template_id !== "string" || !missionTemplateById(input.template_id)) {
    return NextResponse.json({ error: "Unsupported product event." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const { error } = await supabase.from("product_growth_events").insert({
      user_id: user.id, event_type: "template_shared", template_id: input.template_id,
    });
    if (error?.code === "23505") return NextResponse.json({ recorded: true, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
    if (error) return NextResponse.json({ error: "Product metrics are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Product metrics are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

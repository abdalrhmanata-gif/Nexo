import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase/server";
import { getAiUsage } from "../../../../lib/ai-usage";

export const runtime = "nodejs";

export async function GET() {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    return NextResponse.json(await getAiUsage(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "AI usage service is temporarily unavailable." }, { status: 503 });
  }
}

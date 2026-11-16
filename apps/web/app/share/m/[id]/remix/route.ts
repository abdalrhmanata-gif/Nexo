import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestOrigin } from "../../../../../lib/auth/redirect.mjs";
import { remixQuery, shareIdOrNull, type MissionShareSnapshot } from "../../../../../lib/mission-share.mjs";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Remix this Mission": count it, then open the new-mission form as a draft
 * of the shared mission. Nothing is created here; the person edits and
 * submits the draft themselves, after signing in if they have to.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = resolveRequestOrigin(request.headers, request.url);
  const shareId = shareIdOrNull((await params).id);
  if (!shareId) return NextResponse.redirect(new URL("/templates", origin));
  const supabase = await createSupabaseServerClient();
  const found = await supabase.rpc("get_mission_share", { p_id: shareId });
  const snapshot = found.error ? null : found.data as MissionShareSnapshot | null;
  if (!snapshot) return NextResponse.redirect(new URL(`/share/m/${shareId}`, origin));
  await supabase.rpc("record_mission_share_event", { p_id: shareId, p_kind: "remix" });
  return NextResponse.redirect(new URL(`/app/missions/new?${remixQuery(snapshot)}`, origin));
}

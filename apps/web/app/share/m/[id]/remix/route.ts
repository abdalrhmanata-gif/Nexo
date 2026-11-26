import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestOrigin } from "../../../../../lib/auth/redirect.mjs";
import { remixQuery, shareIdOrNull, type MissionShareSnapshot } from "../../../../../lib/mission-share.mjs";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Use this checklist": count it, then open the new-mission form as a draft
 * of the shared checklist. Nothing is created here; the person edits and
 * submits the draft themselves.
 *
 * A visitor who is not signed in goes to sign-up first, with this short
 * address as the place to come back to. The draft's own address carries
 * every step, and an Arabic checklist's steps grow nine-fold when encoded:
 * handed through sign-up and the confirmation email, it could outgrow what
 * a link may hold. Coming back here builds it once, after sign-in.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = resolveRequestOrigin(request.headers, request.url);
  const shareId = shareIdOrNull((await params).id);
  if (!shareId) return NextResponse.redirect(new URL("/checklists", origin));
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const signUp = new URL("/auth/sign-up", origin);
    signUp.searchParams.set("next", `/share/m/${shareId}/remix`);
    return NextResponse.redirect(signUp);
  }
  const found = await supabase.rpc("get_mission_share", { p_id: shareId });
  const snapshot = found.error ? null : found.data as MissionShareSnapshot | null;
  if (!snapshot) return NextResponse.redirect(new URL(`/share/m/${shareId}`, origin));
  await supabase.rpc("record_mission_share_event", { p_id: shareId, p_kind: "remix" });
  return NextResponse.redirect(new URL(`/app/missions/new?${remixQuery(snapshot)}`, origin));
}

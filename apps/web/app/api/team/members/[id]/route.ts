import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { isTrustedSameOriginRequest } from "../../../../../lib/request-origin.mjs";
import { workspaceCookieValue } from "../../../../../lib/team-workspace.mjs";

export const dynamic = "force-dynamic";

/**
 * Remove someone from the workspace, or leave one. The database allows the
 * owner to remove a member and a member to remove themselves, and never the
 * owner.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedSameOriginRequest(request)) return NextResponse.json({ error: "The member could not be removed." }, { status: 403 });
  const id = workspaceCookieValue((await params).id);
  if (!id) return NextResponse.json({ error: "The member could not be removed." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const removed = await supabase.rpc("remove_workspace_member", { p_member_id: id });
  if (removed.error) return NextResponse.json({ error: "The member could not be removed." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

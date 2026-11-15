import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { isTrustedSameOriginRequest } from "../../../../lib/request-origin.mjs";
import { WORKSPACE_COOKIE, workspaceCookieValue } from "../../../../lib/team-workspace.mjs";

export const dynamic = "force-dynamic";

/**
 * Choose which workspace the app shows. Only a workspace the person is a
 * member of can be chosen; an empty choice returns to their own.
 */
export async function POST(request: NextRequest) {
  if (!isTrustedSameOriginRequest(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const response = NextResponse.json({ ok: true });
  if (body.workspaceId === null) {
    response.cookies.delete(WORKSPACE_COOKIE);
    return response;
  }
  const workspaceId = workspaceCookieValue(body.workspaceId);
  if (!workspaceId) return NextResponse.json({ error: "Not allowed." }, { status: 400 });
  const membership = await supabase.from("workspace_members").select("workspace_id").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (membership.error || !membership.data) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  response.cookies.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}

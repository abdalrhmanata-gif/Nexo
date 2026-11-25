import { NextResponse, type NextRequest } from "next/server";
import { readMissionWorkspaceId } from "../../../../lib/supabase/mission-repository";
import { WORKSPACE_COOKIE, workspaceCookieValue } from "../../../../lib/team-workspace.mjs";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a Mission from anywhere: an email that says a step is yours, or the
 * "Assigned to you" list. The app shows one workspace at a time, so a link to
 * a Mission in another workspace the person belongs to used to say "We could
 * not find that mission". This switches to the Mission's workspace first.
 *
 * Signed-out visitors are sent to sign in by the middleware and come back
 * here. Row level security decides whether the Mission can be seen; when it
 * cannot, the Mission page explains, exactly as before.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.redirect(new URL("/app", request.url));
  const destination = new URL(`/app/missions/${id}`, request.url);
  const workspaceId = workspaceCookieValue(await readMissionWorkspaceId(id));
  const response = NextResponse.redirect(destination);
  if (workspaceId) {
    response.cookies.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

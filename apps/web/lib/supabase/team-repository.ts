import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./server";
import { isSupabaseConfigured } from "./config";
import { WORKSPACE_COOKIE, workspaceCookieValue } from "../team-workspace.mjs";

// What the team page and the header need to know about workspaces. Every
// read goes through row level security as the signed-in person; nothing here
// decides access.

export type TeamMember = { id: string; email: string; role: string; isYou: boolean };
export type PendingInvitation = { id: string; email: string; role: string; expiresAt: string };
export type SharedWorkspace = { workspaceId: string; memberId: string; ownerEmail: string; role: string; open: boolean };
export type TeamOverview = {
  workspaceId: string;
  members: TeamMember[];
  pending: PendingInvitation[];
  shared: SharedWorkspace[];
  ownOpen: boolean;
};

async function chosenWorkspace() {
  try {
    return workspaceCookieValue((await cookies()).get(WORKSPACE_COOKIE)?.value);
  } catch {
    return null;
  }
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function ownerEmailOf(supabase: Client, workspaceId: string) {
  const members = await supabase.rpc("list_workspace_members", { p_workspace_id: workspaceId });
  if (members.error) return "";
  const owner = (members.data as { email: string | null; role: string }[]).find((member) => member.role === "owner");
  return owner?.email ?? "";
}

export async function readTeamOverview(): Promise<TeamOverview> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");
  const owned = await supabase.rpc("ensure_owned_workspace");
  if (owned.error || typeof owned.data !== "string") throw owned.error ?? new Error("Workspace unavailable.");
  const workspaceId = owned.data;

  const [members, pending, memberships, chosen] = await Promise.all([
    supabase.rpc("list_workspace_members", { p_workspace_id: workspaceId }),
    supabase.from("workspace_invitations").select("id, email, role, expires_at")
      .eq("workspace_id", workspaceId).eq("status", "PENDING").gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("workspace_members").select("id, workspace_id, role").eq("user_id", user.id).neq("workspace_id", workspaceId),
    chosenWorkspace(),
  ]);
  if (members.error) throw members.error;
  if (pending.error) throw pending.error;
  if (memberships.error) throw memberships.error;

  const shared = await Promise.all((memberships.data as { id: string; workspace_id: string; role: string }[]).map(async (row) => ({
    workspaceId: row.workspace_id,
    memberId: row.id,
    ownerEmail: await ownerEmailOf(supabase, row.workspace_id),
    role: row.role,
    open: chosen === row.workspace_id,
  })));

  return {
    workspaceId,
    members: (members.data as { id: string; user_id: string; email: string | null; role: string }[]).map((member) => ({
      id: member.id, email: member.email ?? "", role: member.role, isYou: member.user_id === user.id,
    })),
    pending: (pending.data as { id: string; email: string; role: string; expires_at: string }[]).map((invitation) => ({
      id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expires_at,
    })),
    shared,
    ownOpen: !shared.some((workspace) => workspace.open),
  };
}

/**
 * The workspace someone else owns that the app is showing, if any, for the
 * band under the header. Costs nothing when no workspace was chosen.
 */
export async function readOpenSharedWorkspace(): Promise<{ ownerEmail: string; role: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const chosen = await chosenWorkspace();
  if (!chosen) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const membership = await supabase.from("workspace_members").select("role").eq("workspace_id", chosen).eq("user_id", user.id).maybeSingle();
    if (membership.error || !membership.data || membership.data.role === "owner") return null;
    return { ownerEmail: await ownerEmailOf(supabase, chosen), role: membership.data.role as string };
  } catch {
    return null;
  }
}

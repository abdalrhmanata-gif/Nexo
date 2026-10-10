import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";

const ROLES = ["admin", "member", "viewer"] as const;
type InvitationRole = (typeof ROLES)[number];

function isRole(value: unknown): value is InvitationRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

async function sendInvitationEmail(input: { email: string; role: InvitationRole; inviteUrl: string; expiresAt: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { ok: false as const, reason: "EMAIL_NOT_CONFIGURED" as const };

  const recipient = escapeHtml(input.email);
  const role = escapeHtml(input.role);
  const link = escapeHtml(input.inviteUrl);
  const expiry = new Date(input.expiresAt).toUTCString();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "You’ve been invited to a ZAVQERA workspace",
      text: `You have been invited to join a ZAVQERA workspace as ${input.role}. Accept the invitation: ${input.inviteUrl}\n\nThis secure link expires on ${expiry}. If you were not expecting this invitation, you can ignore this email.`,
      html: `<!doctype html><html><body style="margin:0;background:#f6f8fa;font-family:Arial,Helvetica,sans-serif;color:#17212b"><div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dbe2e8;border-radius:12px"><p style="font-size:12px;letter-spacing:2px;font-weight:bold;color:#087f78">ZAVQERA · WORKSPACE INVITATION</p><h1 style="font-size:28px;color:#16324f">Work better together.</h1><p>You’ve been invited to join a ZAVQERA workspace as <strong>${role}</strong>.</p><p>Accept the invitation using the secure link below. You must sign in with the invited email address (${recipient}).</p><p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#16324f;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-weight:bold">Accept invitation</a></p><p style="font-size:13px;color:#65717c">This link expires on ${escapeHtml(expiry)}. If you weren’t expecting this invitation, you can ignore this email.</p><p style="font-size:12px;color:#65717c">ZAVQERA keeps AI work, permissions, and outcomes in one place.</p></div></body></html>`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    // Keep provider response details private; do not log recipient or token.
    return { ok: false as const, reason: "EMAIL_PROVIDER_REJECTED" as const };
  }
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Workspace invitations require the connected workspace backend." }, { status: 503 });
    }

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = isRole(body.role) ? body.role : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) {
      return NextResponse.json({ error: "Provide a valid email address and role." }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim()) {
      return NextResponse.json({ error: "Email invitations are not configured yet. Please contact the workspace owner." }, { status: 503 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const repository = await createSupabaseMissionRepository();
    if (!repository.createWorkspaceInvitation || !repository.revokeWorkspaceInvitation) {
      return NextResponse.json({ error: "Workspace invitations are not available." }, { status: 503 });
    }

    let invitation;
    try {
      invitation = await repository.createWorkspaceInvitation({ email, role, tokenHash, expiresAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const known = message.includes("INVITATION_ALREADY_PENDING")
        ? "An invitation is already pending for this email."
        : message.includes("USER_ALREADY_MEMBER")
          ? "This user is already a workspace member."
          : message.includes("WORKSPACE_ADMIN_REQUIRED")
            ? "Only a workspace owner or admin can invite teammates."
            : "The invitation could not be created.";
      return NextResponse.json({ error: known }, { status: message.includes("WORKSPACE_ADMIN_REQUIRED") ? 403 : 400 });
    }

    const inviteUrl = new URL(`/invite/${token}`, request.nextUrl.origin).toString();
    try {
      const emailResult = await sendInvitationEmail({ email, role, inviteUrl, expiresAt });
      if (!emailResult.ok) {
        await repository.revokeWorkspaceInvitation(invitation.id).catch(() => undefined);
        return NextResponse.json({
          error: emailResult.reason === "EMAIL_NOT_CONFIGURED"
            ? "Email invitations are not configured yet."
            : "The invitation email could not be delivered. Check the sender configuration and try again.",
        }, { status: 503 });
      }
    } catch {
      await repository.revokeWorkspaceInvitation(invitation.id).catch(() => undefined);
      return NextResponse.json({ error: "The invitation email could not be delivered. The pending invitation was revoked; please try again." }, { status: 502 });
    }

    return NextResponse.json({
      invitation: { id: invitation.id, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt },
      delivery: "sent",
    });
  } catch {
    return NextResponse.json({ error: "The invitation request could not be processed." }, { status: 400 });
  }
}

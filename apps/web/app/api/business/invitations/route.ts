import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { resolveInvitationConfiguredUrl } from "../../../../lib/invitation-origin.mjs";
import { sendWorkspaceInvitationEmail } from "../../../../lib/workspace-invitation-email.mjs";

const ROLES = ["admin", "member", "viewer"] as const;
type InvitationRole = (typeof ROLES)[number];

function isRole(value: unknown): value is InvitationRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function getTrustedSiteOrigin(request: NextRequest) {
  const context = process.env.CONTEXT?.trim().toLowerCase();
  const isDeployPreview = context === "deploy-preview"
    || process.env.PULL_REQUEST?.trim().toLowerCase() === "true";
  const deployOrigin = process.env.DEPLOY_PRIME_URL?.trim();
  const explicitOrigin = process.env.ZAVQERA_INVITATION_BASE_URL?.trim();
  const configured = resolveInvitationConfiguredUrl({
    context,
    pullRequest: process.env.PULL_REQUEST,
    deployPrimeUrl: deployOrigin,
    explicitOrigin,
    siteUrl: process.env.URL,
    publicSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!configured) {
    if (isDeployPreview) throw new Error("PREVIEW_ORIGIN_NOT_CONFIGURED");
    if (process.env.NODE_ENV === "production") throw new Error("SITE_URL_NOT_CONFIGURED");
    return request.nextUrl.origin;
  }

  const parsed = new URL(configured);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("SITE_URL_INVALID");
  }
  if (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && parsed.protocol === "http:")) {
    throw new Error("SITE_URL_MUST_USE_HTTPS");
  }
  return parsed.origin;
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

    let siteOrigin: string;
    try {
      siteOrigin = getTrustedSiteOrigin(request);
    } catch {
      return NextResponse.json({ error: "Secure invitation links are not configured for this deployment yet." }, { status: 503 });
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

    const inviteUrl = new URL(`/invite/${token}`, siteOrigin).toString();
    try {
      const emailResult = await sendWorkspaceInvitationEmail(
        { email, role, inviteUrl, expiresAt, idempotencyKey: "workspace-invitation/" + invitation.id },
        { apiKey: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL },
      );
      if (!emailResult.ok) {
        let revoked = false;
        try {
          await repository.revokeWorkspaceInvitation(invitation.id);
          revoked = true;
        } catch {
          // Report the orphaned pending invitation explicitly; never imply cleanup succeeded.
        }
        const message = emailResult.reason === "EMAIL_NOT_CONFIGURED"
          ? "Email invitations are not configured yet."
          : "The email provider rejected the invitation. Check the sender configuration and try again.";
        return NextResponse.json({
          error: revoked ? message : message + " The pending invitation could not be cleared; revoke it in Business before retrying.",
        }, { status: 503 });
      }
    } catch {
      // A network timeout is ambiguous: the provider may already have accepted the email.
      // Keep the pending invitation so a delivered link is not invalidated by speculative cleanup.
      return NextResponse.json({
        error: "We could not confirm whether the email provider accepted this invitation. Check provider logs before retrying; revoke the pending invitation in Business only if it was not sent.",
      }, { status: 502 });
    }

    return NextResponse.json({
      invitation: { id: invitation.id, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt },
      delivery: "accepted",
    });
  } catch {
    return NextResponse.json({ error: "The invitation request could not be processed." }, { status: 400 });
  }
}

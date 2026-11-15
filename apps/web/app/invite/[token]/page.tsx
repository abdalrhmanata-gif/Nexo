import Link from "next/link";
import { LocalizedFill, LocalizedText } from "../../../components/localized-text";
import { InvitationAccept } from "../../../components/team-manager";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { acceptErrorMessage, hashInvitationToken } from "../../../lib/team-invitations.mjs";

export const dynamic = "force-dynamic";

type Invitation = { email: string; role: string; status: string; expires_at: string };

async function readInvitation(token: string) {
  const tokenHash = hashInvitationToken(token);
  if (!tokenHash || !isSupabaseConfigured()) return { invitation: null, userEmail: null };
  const supabase = await createSupabaseServerClient();
  const [found, auth] = await Promise.all([
    supabase.rpc("get_workspace_invitation", { p_token_hash: tokenHash }),
    supabase.auth.getUser(),
  ]);
  const rows = (found.error ? [] : found.data) as Invitation[] | null;
  return { invitation: rows?.[0] ?? null, userEmail: auth.data.user?.email?.toLowerCase() ?? null };
}

function Problem({ message }: { message: string }) {
  return <div className="container invite-page">
    <section className="card team-panel">
      <p className="eyebrow"><LocalizedText en="Workspace invitation" /></p>
      <h1><LocalizedText en={message} /></h1>
      <Link className="button button-quiet" href="/"><LocalizedText en="Go to ZAVQERA" /></Link>
    </section>
  </div>;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { invitation, userEmail } = await readInvitation(token);
  if (!invitation) return <Problem message={acceptErrorMessage("INVITATION_NOT_FOUND")} />;
  if (invitation.status !== "PENDING") return <Problem message={acceptErrorMessage("INVITATION_NOT_PENDING")} />;
  if (Date.parse(invitation.expires_at) <= Date.now()) return <Problem message={acceptErrorMessage("INVITATION_EXPIRED")} />;

  const next = encodeURIComponent(`/invite/${token}`);
  const access = invitation.role === "viewer" ? "You will be able to view the missions in it." : "You will be able to view and edit the missions in it.";
  return <div className="container invite-page">
    <section className="card team-panel">
      <p className="eyebrow"><LocalizedText en="Workspace invitation" /></p>
      <h1><LocalizedText en="You are invited to a workspace in ZAVQERA" /></h1>
      <p><LocalizedFill en="This invitation is for {email}." values={{ email: invitation.email }} /> <LocalizedText en={access} /></p>
      {!userEmail && <>
        <p className="muted"><LocalizedText en="Sign in with that address to accept. New to ZAVQERA? Create an account with it, confirm your email, then open this link again." /></p>
        <div className="action-control">
          <Link className="button" href={`/auth/sign-in?next=${next}`}><LocalizedText en="Sign in" /></Link>
          <Link className="button button-quiet" href={`/auth/sign-up?next=${next}`}><LocalizedText en="Create account" /></Link>
        </div>
      </>}
      {userEmail && userEmail !== invitation.email && <div className="field-error" role="alert">
        <LocalizedFill en="You are signed in as {email}." values={{ email: userEmail }} /> <LocalizedText en={acceptErrorMessage("INVITATION_EMAIL_MISMATCH")} />
      </div>}
      {userEmail === invitation.email && <InvitationAccept token={token} />}
    </section>
  </div>;
}

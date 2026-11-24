import Link from "next/link";
import { redirect } from "next/navigation";
import { LocalizedFill, LocalizedText } from "../../../components/localized-text";
import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { clientLabel, isAuthorizationId, redirectTarget } from "../../../lib/mcp/consent.mjs";
import { authorizationDetails, type AuthorizationDetails, type AuthorizationRedirect } from "../../../lib/mcp/oauth-server";
import { decideAuthorization } from "./actions";

// Where Supabase Auth sends a person when ChatGPT, Claude, Gemini or another
// MCP client asks to use their ZAVQERA account. They see who is asking, what
// it will be able to do and where they go next, then allow or deny.

export const dynamic = "force-dynamic";

type Search = { authorization_id?: string; status?: string };

function Problem({ text }: { text: string }) {
  return <div className="container consent-page">
    <div className="card consent-card">
      <h1 className="detail-title"><LocalizedText en="This connection request cannot be used" /></h1>
      <p><LocalizedText en={text} /></p>
      <p><LocalizedText en="Go back to your assistant and connect ZAVQERA again." /></p>
      <Link className="button button-quiet" href="/ai"><LocalizedText en="How to connect an assistant" /></Link>
    </div>
  </div>;
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { authorization_id: id, status } = await searchParams;
  if (!isSupabaseConfigured()) return <Problem text="Connections need the live workspace." />;
  if (!isAuthorizationId(id)) return <Problem text="The link is incomplete or has expired." />;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);

  let details: AuthorizationDetails | AuthorizationRedirect | null = null;
  try {
    const result = await authorizationDetails(supabase, id);
    details = result.error ? null : result.data;
  } catch {
    details = null;
  }
  if (!details) return <Problem text="The link is incomplete or has expired." />;
  // Already allowed before: Supabase hands back the address to continue to.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  const name = clientLabel(details.client?.name);
  const target = redirectTarget(details.redirect_uri);

  return <div className="container consent-page">
    <div className="card consent-card">
      <p className="eyebrow"><LocalizedText en="Connect an AI assistant" /></p>
      <h1 className="detail-title">
        {name
          ? <LocalizedFill en="{app} wants to use your ZAVQERA account" values={{ app: name }} />
          : <LocalizedText en="An AI app wants to use your ZAVQERA account" />}
      </h1>
      {status === "failed" && <p className="field-error" role="alert"><LocalizedText en="That did not work just now. Please try again." /></p>}
      <p className="action-hint"><LocalizedFill en="Signed in as {email}." values={{ email: user.email ?? "" }} /></p>

      <h2><LocalizedText en="It will be able to" /></h2>
      <ul className="consent-list">
        <li><LocalizedText en="See your Missions, their steps, proof and dates." /></li>
        <li><LocalizedText en="Create Missions and add steps." /></li>
        <li><LocalizedText en="Mark steps done with proof, change a step's status and set dates." /></li>
        <li><LocalizedText en="Create a public link to a Mission when you ask it to." /></li>
      </ul>
      <p><LocalizedText en="It cannot see your password or your card details, and it works with your permissions only, as you do on the website." /></p>
      <p><LocalizedText en="What it reads from ZAVQERA becomes part of your conversation with that assistant." /> <Link href="/ai#privacy"><LocalizedText en="Privacy and control" /></Link></p>

      <div className="consent-warning">
        <p><strong><LocalizedText en="Allow this only if you just asked an AI assistant to connect to ZAVQERA." /></strong> <LocalizedText en="The name above is what the app says about itself." /></p>
        {target.host && <p><LocalizedFill en="After you answer, you go back to {host}." values={{ host: target.host }} /></p>}
        {target.loopback && <p><LocalizedText en="This app runs on your own computer. Allow it only if you started it yourself, for example Claude Code." /></p>}
      </div>

      <div className="consent-actions">
        <form action={decideAuthorization}>
          <input type="hidden" name="authorization_id" value={details.authorization_id} />
          <input type="hidden" name="decision" value="approve" />
          <PendingSubmitButton label="Allow" pendingLabel="Connecting…" />
        </form>
        <form action={decideAuthorization}>
          <input type="hidden" name="authorization_id" value={details.authorization_id} />
          <input type="hidden" name="decision" value="deny" />
          <PendingSubmitButton className="button button-quiet" label="Deny" pendingLabel="Cancelling…" />
        </form>
      </div>
      <p className="action-hint"><LocalizedText en="You can remove this connection at any time." /> <Link href="/app/connections"><LocalizedText en="Connected AI apps" /></Link></p>
    </div>
  </div>;
}

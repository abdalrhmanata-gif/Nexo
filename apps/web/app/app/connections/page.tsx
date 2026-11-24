import Link from "next/link";
import { LocalizedDateTime, LocalizedText } from "../../../components/localized-text";
import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { clientLabel } from "../../../lib/mcp/consent.mjs";
import { grants as listGrants, type Grant } from "../../../lib/mcp/oauth-server";
import { removeConnection } from "./actions";

// The AI assistants the person has allowed to use their account, each with
// a way to remove it at once.

export const dynamic = "force-dynamic";

const STATUS: Record<string, { text: string; ok: boolean }> = {
  removed: { text: "Removed. That assistant can no longer use your account.", ok: true },
  failed: { text: "That did not work just now. Please try again.", ok: false },
};

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const message = status ? STATUS[status] : null;
  let grants: Grant[] = [];
  let unreadable = !isSupabaseConfigured();
  if (!unreadable) {
    try {
      const supabase = await createSupabaseServerClient();
      const result = await listGrants(supabase);
      if (result.error) unreadable = true;
      else grants = (result.data ?? []) as Grant[];
    } catch {
      unreadable = true;
    }
  }

  return <div className="container connections-page">
    <p className="eyebrow"><Link href="/app"><LocalizedText en="Workspace" /></Link> <LocalizedText en="/ Connected AI apps" /></p>
    <h1 className="detail-title"><LocalizedText en="Connected AI apps" /></h1>
    <p className="detail-intent"><LocalizedText en="Assistants you allowed to use your ZAVQERA account. Removing one stops it at once; you can connect it again from the assistant whenever you like." /></p>
    {message && <p className={message.ok ? "success-state" : "field-error"} role={message.ok ? "status" : "alert"}><LocalizedText en={message.text} /></p>}
    {unreadable && <p className="field-error" role="alert"><LocalizedText en="Your connections could not be loaded just now. Please refresh the page." /></p>}

    <section className="card">
      {grants.length === 0
        ? <>
          <p><LocalizedText en="No assistant is connected." /></p>
          <Link className="button" href="/ai"><LocalizedText en="Connect ChatGPT, Claude or Gemini" /></Link>
        </>
        : <ul className="list connections-list">
          {grants.map((grant) => {
            const name = clientLabel(grant.client?.name);
            return <li key={grant.client.id}>
              <div className="card-heading">
                <div>
                  <strong>{name ?? <LocalizedText en="An AI app" />}</strong>
                  <small className="action-hint"><LocalizedText en="Connected" /> <LocalizedDateTime value={grant.granted_at} /></small>
                </div>
                <form action={removeConnection}>
                  <input type="hidden" name="client_id" value={grant.client.id} />
                  <PendingSubmitButton className="button button-quiet button-small" label="Remove" pendingLabel="Removing…" />
                </form>
              </div>
            </li>;
          })}
        </ul>}
    </section>
    <p className="action-hint"><Link href="/ai"><LocalizedText en="How ZAVQERA works with AI assistants" /></Link></p>
  </div>;
}

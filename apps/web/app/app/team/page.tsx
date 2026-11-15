import Link from "next/link";
import { LocalizedText } from "../../../components/localized-text";
import { TeamManager } from "../../../components/team-manager";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { readTeamOverview } from "../../../lib/supabase/team-repository";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  if (!isSupabaseConfigured()) {
    return <div className="container team-page">
      <div className="empty-state"><h2><LocalizedText en="Team" /></h2><p><LocalizedText en="Teams are not available in this local copy." /></p></div>
    </div>;
  }
  const overview = await readTeamOverview();
  return <div className="container team-page">
    <section className="section-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Team" /></p>
        <h1><LocalizedText en="Work on missions together" /></h1>
        <p><LocalizedText en="Invite colleagues by email. They join your workspace when they accept, and you can remove them at any time." /></p>
      </div>
      <Link className="button button-quiet" href="/app/business"><span aria-hidden="true">←</span> <LocalizedText en="Business" /></Link>
    </section>
    <TeamManager overview={overview} />
  </div>;
}

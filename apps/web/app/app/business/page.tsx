import Link from "next/link";
import { LocalizedText } from "../../../components/localized-text";
import { MissionCard } from "../../../components/mission-card";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";

export default async function BusinessWorkspacePage() {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const missions = await repository.listMissions();
  const active = missions.filter((mission) => mission.status === "ACTIVE");
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const completed = missions.filter((mission) => mission.status === "COMPLETED");
  const verified = missions.filter((mission) => mission.verifications.some((item) => item.status === "VERIFIED"));
  const recent = [...missions].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 3);

  return <div className="container">
    <div className="section-heading"><div>
      <p className="eyebrow"><LocalizedText en="Business workspace" nb="Arbeidsområde" ar="مساحة العمل" /></p>
      <h1>Run AI work as a team</h1>
      <p>One mission engine for work, approvals, verification, and outcomes. This first business layer stays lightweight and uses the same missions you already have.</p>
    </div><Link className="button" href="/app/missions/new">New mission</Link></div>

    <div className="stats" aria-label="Business workspace metrics">
      <div className="stat"><strong>1</strong><span>Workspace owner</span></div>
      <div className="stat"><strong>{active.length}</strong><span>Active missions</span></div>
      <div className="stat"><strong>{waiting.length}</strong><span>Needs approval/input</span></div>
      <div className="stat"><strong>{verified.length}</strong><span>Verified</span></div>
    </div>

    <section className="grid">
      <section className="card"><p className="eyebrow">Delegated work</p><h2>Shared mission layer</h2><p>Every mission keeps its intent, actions, execution history, verification, and outcome together. That gives a team one source of truth instead of separate AI chats.</p><Link className="button button-small" href="/app">Open mission workspace</Link></section>
      <section className="card"><p className="eyebrow">Authority</p><h2>Approvals before side effects</h2><p>Read-only execution is available now. External side effects remain bounded until an explicit authority and approval path exists.</p><span className="status status-waiting">Approval controls ready for expansion</span></section>
      <section className="card"><p className="eyebrow">Evidence</p><h2>Verification before outcome</h2><p>AI results remain unverified until someone records what was checked and the evidence that supports it. Outcomes are committed only from a passing verification.</p></section>
      <section className="card"><p className="eyebrow">People</p><h2>Team access</h2><p>The current workspace is owner-scoped. The collaboration boundary is intentionally prepared without inventing members or permissions that are not yet persisted.</p><span className="action-hint">Next expansion: members, roles, shared missions.</span></section>
    </section>

    <div className="section-heading"><div><h2>Recent missions</h2><p>Recent work stays connected to the same execution engine.</p></div><Link className="button button-quiet" href="/app">View all</Link></div>
    {recent.length ? <div className="grid">{recent.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div> : <div className="empty-state"><h2>No missions yet</h2><p>Create the first delegated mission to start the workspace.</p></div>}
    {completed.length > 0 && <p className="action-hint">Completed missions remain available as historical work and can be used as the basis for reusable mission templates later.</p>}
  </div>;
}

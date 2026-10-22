import Link from "next/link";
import { MissionCard } from "../../components/mission-card";
import { localMockMissionRepository } from "../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../lib/supabase/mission-repository";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const missions = await repository.listMissions();
  const { error } = await searchParams;
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const averageProgress = missions.length ? Math.round(missions.reduce((total, mission) => total + mission.progress, 0) / missions.length) : 0;

  return <div className="container">
    {error === "mission-provenance" && <div className="field-error" role="alert">This Mission cannot be deleted because its historical provenance must be preserved.</div>}
    <div className="section-heading">
      <div><p className="eyebrow">Workspace</p><h1>Good morning, operator.</h1><p>Here is what needs attention now.</p></div>
      <Link className="button" href="/app/missions/new">New mission</Link>
    </div>
    <section className="attention-panel" aria-labelledby="attention-heading">
      <div><p className="eyebrow">Next up</p><h2 id="attention-heading">{waiting.length ? `${waiting.length} mission needs your input` : "Nothing is waiting on you"}</h2>
      <p>{waiting.length ? "Review the open decision before work can continue." : "Your active missions are moving within their stated boundaries."}</p></div>
      {waiting[0] && <Link className="button button-quiet" href={`/app/missions/${waiting[0].id}`}>Review decision</Link>}
    </section>
    <div className="stats"><div className="stat"><strong>{missions.length}</strong><span>Open missions</span></div><div className="stat"><strong>{waiting.length}</strong><span>Needs your input</span></div><div className="stat"><strong>{averageProgress}%</strong><span>Average progress</span></div></div>
    <div className="section-heading"><div><h2>Recent missions</h2><p>Your private workspace</p></div></div>
    {missions.length ? <div className="grid">{missions.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div> : <div className="empty-state"><h2>No missions yet</h2><p>Create a bounded mission to begin.</p><Link className="button" href="/app/missions/new">Create mission</Link></div>}
  </div>;
}

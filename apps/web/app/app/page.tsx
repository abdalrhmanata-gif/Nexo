import Link from "next/link";
import { MissionCard } from "../../components/mission-card";
import { localMockMissionRepository } from "../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../lib/supabase/mission-repository";

const ERRORS: Record<string, string> = {
  "mission-provenance": "This Mission cannot be deleted because its historical provenance must be preserved.",
  "mission-delete": "That Mission could not be deleted. It may already have been removed.",
  authentication: "Your session has expired. Sign in again to continue.",
};

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const missions = await repository.listMissions();
  const { error, status } = await searchParams;
  const errorMessage = ERRORS[error ?? ""];

  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const active = missions.filter((mission) => mission.status === "ACTIVE");
  const completed = missions.filter((mission) => mission.status === "COMPLETED");
  const unstarted = missions.filter((mission) => mission.actionsTotal === 0);\n  const selectedStatus = ["ACTIVE", "WAITING", "COMPLETED"].includes(status ?? "") ? status : "";\n  const visibleMissions = selectedStatus ? missions.filter((mission) => mission.status === selectedStatus) : missions;

  return <div className="container">
    {errorMessage && <div className="field-error" role="alert">{errorMessage}</div>}
    <div className="section-heading">
      <div>
        <p className="eyebrow">Workspace</p>
        <h1>What needs your attention</h1>
        <p>Every mission below is a stated outcome and the work required to reach it.</p>
      </div>
      <Link className="button" href="/app/missions/new">New mission</Link>
    </div>

    {missions.length > 0 && <section className="attention-panel" aria-labelledby="attention-heading">
      <div>
        <p className="eyebrow">Next up</p>
        <h2 id="attention-heading">{waiting.length
          ? `${waiting.length} ${waiting.length === 1 ? "mission needs" : "missions need"} your input`
          : unstarted.length
            ? `${unstarted.length} ${unstarted.length === 1 ? "mission has" : "missions have"} no actions yet`
            : "Nothing is waiting on you"}</h2>
        <p>{waiting.length
          ? "Work is paused until you resolve the open decision."
          : unstarted.length
            ? "Add the work each mission needs before it can move."
            : "Your active missions are moving within their stated boundaries."}</p>
      </div>
      {(waiting[0] ?? unstarted[0]) && <Link className="button button-quiet" href={`/app/missions/${(waiting[0] ?? unstarted[0]).id}`}>Open mission</Link>}
    </section>}

    {missions.length > 0 && <div className="stats">
      <div className="stat"><strong>{active.length}</strong><span>Active</span></div>
      <div className="stat"><strong>{waiting.length}</strong><span>Needs your input</span></div>
      <div className="stat"><strong>{completed.length}</strong><span>Completed</span></div>
    </div>}

    <div className="section-heading"><div><h2>Your missions</h2><p>Most recently updated first.</p></div></div>
    {missions.length
      ? <div className="grid">{missions.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div>
      : <div className="empty-state">
        <h2>No missions yet</h2>
        <p>A mission records an outcome you intend to reach and the work required to reach it. Create your first one to begin.</p>
        <Link className="button" href="/app/missions/new">Create mission</Link>
      </div>}
  </div>;
}

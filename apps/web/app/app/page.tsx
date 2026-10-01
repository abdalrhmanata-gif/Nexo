import Link from "next/link";
import { AiPlanner } from "../../components/ai-planner";
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
  const unstarted = missions.filter((mission) => mission.actionsTotal === 0);
  const selectedStatus = ["ACTIVE", "WAITING", "COMPLETED"].includes(status ?? "") ? status : "";
  const visibleMissions = selectedStatus ? missions.filter((mission) => mission.status === selectedStatus) : missions;

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

    <AiPlanner />

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

    {missions.length > 0 && <div className="stats" aria-label="Mission status filters">
      <Link className={`stat${selectedStatus === "ACTIVE" ? " stat-selected" : ""}`} href="/app?status=ACTIVE" aria-current={selectedStatus === "ACTIVE" ? "page" : undefined}>
        <strong>{active.length}</strong><span>Active</span>
      </Link>
      <Link className={`stat${selectedStatus === "WAITING" ? " stat-selected" : ""}`} href="/app?status=WAITING" aria-current={selectedStatus === "WAITING" ? "page" : undefined}>
        <strong>{waiting.length}</strong><span>Needs your input</span>
      </Link>
      <Link className={`stat${selectedStatus === "COMPLETED" ? " stat-selected" : ""}`} href="/app?status=COMPLETED" aria-current={selectedStatus === "COMPLETED" ? "page" : undefined}>
        <strong>{completed.length}</strong><span>Completed</span>
      </Link>
    </div>}

    <div className="section-heading">
      <div><h2>{selectedStatus ? `${selectedStatus[0]}${selectedStatus.slice(1).toLowerCase()} missions` : "Your missions"}</h2><p>Most recently updated first.</p></div>
      {selectedStatus && <Link className="button button-quiet" href="/app">Show all</Link>}
    </div>
    {visibleMissions.length
      ? <div className="grid">{visibleMissions.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div>
      : <div className="empty-state">
        <h2>No missions yet</h2>
        <p>A mission records an outcome you intend to reach and the work required to reach it. Create your first one to begin.</p>
        <Link className="button" href="/app/missions/new">Create mission</Link>
      </div>}
  </div>;
}

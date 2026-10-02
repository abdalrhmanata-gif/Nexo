import Link from "next/link";
import { AiPlanner } from "../../components/ai-planner";
import { LocalizedText } from "../../components/localized-text";
import { MissionCard } from "../../components/mission-card";
import { localMockMissionRepository } from "../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../lib/supabase/mission-repository";

const ERRORS: Record<string, string> = {
  "mission-provenance": "This Mission cannot be deleted because its historical provenance must be preserved.",
  "mission-delete": "That Mission could not be deleted. It may already have been removed.",
  authentication: "Your session has expired. Sign in again to continue.",
};

export default async function <LocalizedText en="Workspace" />Page({
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
        <h1><LocalizedText en="What needs your attention" /></h1>
        <p><LocalizedText en="Every mission below is a stated outcome and the work required to reach it." /></p>
      </div>
      <Link className="button" href="/app/missions/new"><LocalizedText en="New mission" /></Link>
    </div>

    <AiPlanner />

    {missions.length > 0 && <section className="attention-panel" aria-labelledby="attention-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Next up" /></p>
        <h2 id="attention-heading">{waiting.length
          ? `${waiting.length} ${waiting.length === 1 ? "mission needs" : "missions need"} your input`
          : unstarted.length
            ? `${unstarted.length} ${unstarted.length === 1 ? "mission has" : "missions have"} no actions yet`
            : <LocalizedText en="Nothing is waiting on you" />}</h2>
        <p>{waiting.length
          ? <LocalizedText en="Work is paused until you resolve the open decision." />
          : unstarted.length
            ? <LocalizedText en="Add the work each mission needs before it can move." />
            : <LocalizedText en="Your active missions are moving within their stated boundaries." />}</p>
      </div>
      {(waiting[0] ?? unstarted[0]) && <Link className="button button-quiet" href={`/app/missions/${(waiting[0] ?? unstarted[0]).id}`}><LocalizedText en="Open mission" /></Link>}
    </section>}

    {missions.length > 0 && <div className="stats" aria-label="Mission status filters">
      <Link className={`stat${selectedStatus === "ACTIVE" ? " stat-selected" : ""}`} href="/app?status=ACTIVE" aria-current={selectedStatus === "ACTIVE" ? "page" : undefined}>
        <strong>{active.length}</strong><span><LocalizedText en="Active" /></span>
      </Link>
      <Link className={`stat${selectedStatus === "WAITING" ? " stat-selected" : ""}`} href="/app?status=WAITING" aria-current={selectedStatus === "WAITING" ? "page" : undefined}>
        <strong>{waiting.length}</strong><span><LocalizedText en="Needs your input" /></span>
      </Link>
      <Link className={`stat${selectedStatus === "COMPLETED" ? " stat-selected" : ""}`} href="/app?status=COMPLETED" aria-current={selectedStatus === "COMPLETED" ? "page" : undefined}>
        <strong>{completed.length}</strong><span><LocalizedText en="Completed" /></span>
      </Link>
    </div>}

    <div className="section-heading">
      <div><h2>{selectedStatus ? `${selectedStatus[0]}${selectedStatus.slice(1).toLowerCase()} missions` : <LocalizedText en="Your missions" />}</h2><p><LocalizedText en="Most recently updated first." /></p></div>
      {selectedStatus && <Link className="button button-quiet" href="/app"><LocalizedText en="Show all" /></Link>}
    </div>
    {visibleMissions.length
      ? <div className="grid">{visibleMissions.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div>
      : <div className="empty-state">
        <h2><LocalizedText en="No missions yet" /></h2>
        <p><LocalizedText en="A mission records an outcome you intend to reach and the work required to reach it. Create your first one to begin." /></p>
        <Link className="button" href="/app/missions/new"><LocalizedText en="Create mission" /></Link>
      </div>}
  </div>;
}

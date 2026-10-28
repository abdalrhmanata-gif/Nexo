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
  searchParams: Promise<{ error?: string; status?: string; q?: string }>;
}) {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const missions = await repository.listMissions();
  const { error, status, q } = await searchParams;
  const query = (q ?? "").trim().slice(0, 120);
  const errorMessage = ERRORS[error ?? ""];

  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const active = missions.filter((mission) => mission.status === "ACTIVE");
  const completed = missions.filter((mission) => mission.status === "COMPLETED");
  const unstarted = missions.filter((mission) => mission.actionsTotal === 0);
  const selectedStatus = ["ACTIVE", "WAITING", "COMPLETED"].includes(status ?? "") ? status : "";
  const selectedMissions = selectedStatus ? missions.filter((mission) => mission.status === selectedStatus) : missions;
  const normalizedQuery = query.toLocaleLowerCase();
  const visibleMissions = selectedMissions.filter((mission) => !normalizedQuery || [
    mission.name, mission.intent, ...mission.criteria, ...mission.actions.map((action) => action.title),
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));

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

    <section className="mission-search" id="mission-search" aria-labelledby="mission-search-heading" tabIndex={-1}>
      <div>
        <p className="eyebrow">Find a mission</p>
        <h2 id="mission-search-heading">Search your missions</h2>
        <p>Find by mission name, goal, success criterion, or step.</p>
      </div>
      <form className="mission-search-form" method="get" action="/app" role="search">
        {selectedStatus && <input type="hidden" name="status" value={selectedStatus} />}
        <label className="visually-hidden" htmlFor="mission-search-input">Search missions</label>
        <input id="mission-search-input" name="q" type="search" defaultValue={query} maxLength={120} placeholder="Search missions…" autoComplete="off" />
        <button className="button" type="submit">Search</button>
        {query && <Link className="button button-quiet" href={selectedStatus ? `/app?status=${selectedStatus}#mission-search` : "/app#mission-search"}>Clear</Link>}
      </form>
      {query && <p className="mission-search-result" aria-live="polite"><strong>{visibleMissions.length}</strong> {visibleMissions.length === 1 ? "mission" : "missions"} found for “{query}”.</p>}
    </section>

    {missions.length > 0 && <div className="stats" aria-label="Mission status filters">
      <Link className={`stat${selectedStatus === "ACTIVE" ? " stat-selected" : ""}`} href={query ? `/app?status=ACTIVE&q=${encodeURIComponent(query)}#mission-search` : "/app?status=ACTIVE"} aria-current={selectedStatus === "ACTIVE" ? "page" : undefined}>
        <strong>{active.length}</strong><span>Active</span>
      </Link>
      <Link className={`stat${selectedStatus === "WAITING" ? " stat-selected" : ""}`} href={query ? `/app?status=WAITING&q=${encodeURIComponent(query)}#mission-search` : "/app?status=WAITING"} aria-current={selectedStatus === "WAITING" ? "page" : undefined}>
        <strong>{waiting.length}</strong><span>Needs your input</span>
      </Link>
      <Link className={`stat${selectedStatus === "COMPLETED" ? " stat-selected" : ""}`} href={query ? `/app?status=COMPLETED&q=${encodeURIComponent(query)}#mission-search` : "/app?status=COMPLETED"} aria-current={selectedStatus === "COMPLETED" ? "page" : undefined}>
        <strong>{completed.length}</strong><span>Completed</span>
      </Link>
    </div>}

    <div className="section-heading">
      <div><h2>{selectedStatus ? `${selectedStatus[0]}${selectedStatus.slice(1).toLowerCase()} missions` : "Your missions"}</h2><p>Most recently updated first.</p></div>
      {selectedStatus && <Link className="button button-quiet" href={query ? `/app?q=${encodeURIComponent(query)}#mission-search` : "/app"}>Show all</Link>}
    </div>
    {visibleMissions.length
      ? <div className="grid">{visibleMissions.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div>
      : <div className="empty-state">
        <h2>{query ? "No matching missions" : "No missions yet"}</h2>
        <p>{query ? "Try a different search term or clear the search to see your missions." : "A mission records an outcome you intend to reach and the work required to reach it. Create your first one to begin."}</p>
        <Link className="button" href={query ? "/app#mission-search" : "/app/missions/new"}>{query ? "Clear search" : "Create mission"}</Link>
      </div>}
  </div>;
}

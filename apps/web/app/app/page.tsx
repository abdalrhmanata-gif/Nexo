import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";
import { MissionSearchEnhancements } from "../../components/mission-search-enhancements";
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
  const errorMessage = ERRORS[error ?? ""];
  const query = (q ?? "").trim().slice(0, 120);

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

  return <div className="container workspace-page">
    {errorMessage && <div className="field-error" role="alert"><LocalizedText en={errorMessage} /></div>}
    <div className="section-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Workspace" /></p>
        <h1><LocalizedText en="What needs your attention" /></h1>
        <p><LocalizedText en="Every mission below is a stated outcome and the work required to reach it." /></p>
      </div>
      <Link className="button" href="/app/missions/new"><LocalizedText en="New mission" /></Link>
    </div>

    {missions.length > 0 && <section className="attention-panel" aria-labelledby="attention-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Next up" /></p>
        <h2 id="attention-heading">{waiting.length
          ? <><strong>{waiting.length}</strong> <LocalizedText en={waiting.length === 1 ? "mission needs your input" : "missions need your input"} /></>
          : unstarted.length
            ? <><strong>{unstarted.length}</strong> <LocalizedText en={unstarted.length === 1 ? "mission has no actions yet" : "missions have no actions yet"} /></>
            : <LocalizedText en="Nothing is waiting on you" />}</h2>
        <p>{waiting.length
          ? <LocalizedText en="Work is paused until you resolve the open decision." />
          : unstarted.length
            ? <LocalizedText en="Add the work each mission needs before it can move." />
            : <LocalizedText en="Your active missions are moving within their stated boundaries." />}</p>
      </div>
      {(waiting[0] ?? unstarted[0]) && <Link className="button button-quiet" href={`/app/missions/${(waiting[0] ?? unstarted[0]).id}`}><LocalizedText en="Open mission" /></Link>}
    </section>}

    <section className="workspace-quick-actions" aria-label="Quick actions">
      <Link className="workspace-quick-action" href="/app/missions/new">
        <span className="workspace-quick-icon quick-icon-create" aria-hidden="true">＋</span>
        <span><strong><LocalizedText en="Create a mission" /></strong><small><LocalizedText en="Start with a concrete outcome" /></small></span>
        <span className="workspace-quick-arrow" aria-hidden="true">→</span>
      </Link>
      <Link className="workspace-quick-action" href="/templates">
        <span className="workspace-quick-icon quick-icon-template" aria-hidden="true">▤</span>
        <span><strong><LocalizedText en="Use a template" /></strong><small><LocalizedText en="Build on a proven starting point" /></small></span>
        <span className="workspace-quick-arrow" aria-hidden="true">→</span>
      </Link>
      <Link className="workspace-quick-action" href="/app/opportunities">
        <span className="workspace-quick-icon quick-icon-opportunity" aria-hidden="true">↗</span>
        <span><strong><LocalizedText en="Evaluate an idea" /></strong><small><LocalizedText en="Compare opportunities before committing" /></small></span>
        <span className="workspace-quick-arrow" aria-hidden="true">→</span>
      </Link>
    </section>

    <section className="mission-search" id="mission-search" aria-labelledby="mission-search-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Find a mission" /></p>
        <h2 id="mission-search-heading"><LocalizedText en="Search your missions" /></h2>
        <p><LocalizedText en="Find by mission name, goal, success criterion, or step." /></p>
      </div>
      <form className="mission-search-form" method="get" action="/app" role="search">
        {selectedStatus && <input type="hidden" name="status" value={selectedStatus} />}
        <label className="visually-hidden" htmlFor="mission-search-input"><LocalizedText en="Search missions" /></label>
        <input id="mission-search-input" name="q" type="search" defaultValue={query} maxLength={120} placeholder="Search missions…" autoComplete="off" />
        <button className="button" type="submit"><LocalizedText en="Search" /></button>
        {query && <Link className="button button-quiet" href={selectedStatus ? `/app?status=${selectedStatus}#mission-search` : "/app#mission-search"}><LocalizedText en="Clear" /></Link>}
        <MissionSearchEnhancements />
      </form>
      {query && <p className="mission-search-result" aria-live="polite"><strong>{visibleMissions.length}</strong> <LocalizedText en={visibleMissions.length === 1 ? "mission found for" : "missions found for"} /> “{query}”.</p>}
    </section>

    {missions.length > 0 && <div className="stats workspace-stats" aria-label="Mission status filters">
      <Link className={`stat${!selectedStatus ? " stat-selected" : ""}`} href={query ? `/app?q=${encodeURIComponent(query)}#mission-search` : "/app"} aria-current={!selectedStatus ? "page" : undefined}>
        <strong>{missions.length}</strong><span><LocalizedText en="All missions" /></span>
      </Link>
      <Link className={`stat${selectedStatus === "ACTIVE" ? " stat-selected" : ""}`} href={query ? `/app?status=ACTIVE&q=${encodeURIComponent(query)}#mission-search` : "/app?status=ACTIVE"} aria-current={selectedStatus === "ACTIVE" ? "page" : undefined}>
        <strong>{active.length}</strong><span><LocalizedText en="Active" /></span>
      </Link>
      <Link className={`stat${selectedStatus === "WAITING" ? " stat-selected" : ""}`} href={query ? `/app?status=WAITING&q=${encodeURIComponent(query)}#mission-search` : "/app?status=WAITING"} aria-current={selectedStatus === "WAITING" ? "page" : undefined}>
        <strong>{waiting.length}</strong><span><LocalizedText en="Needs your input" /></span>
      </Link>
      <Link className={`stat${selectedStatus === "COMPLETED" ? " stat-selected" : ""}`} href={query ? `/app?status=COMPLETED&q=${encodeURIComponent(query)}#mission-search` : "/app?status=COMPLETED"} aria-current={selectedStatus === "COMPLETED" ? "page" : undefined}>
        <strong>{completed.length}</strong><span><LocalizedText en="Completed" /></span>
      </Link>
    </div>}

    <div className="section-heading">
      <div><h2>{selectedStatus === "ACTIVE" ? <LocalizedText en="Active missions" /> : selectedStatus === "WAITING" ? <LocalizedText en="Missions needing your input" /> : selectedStatus === "COMPLETED" ? <LocalizedText en="Completed missions" /> : <LocalizedText en="Your missions" />}</h2>
        <p>{query ? <><strong>{visibleMissions.length}</strong> <LocalizedText en={visibleMissions.length === 1 ? "mission found for" : "missions found for"} /> “{query}”</> : <LocalizedText en="Most recently updated first." />}</p></div>
      {selectedStatus && <Link className="button button-quiet" href={query ? `/app?q=${encodeURIComponent(query)}#mission-search` : "/app"}><LocalizedText en="Show all" /></Link>}
    </div>
    {visibleMissions.length
      ? <div className="grid">{visibleMissions.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div>
      : <div className="empty-state">
        <h2>{query ? <LocalizedText en="No matching missions" /> : <LocalizedText en="No missions yet" />}</h2>
        <p>{query ? <LocalizedText en="Try a different search term or clear the search to see your missions." /> : <LocalizedText en="A mission records an outcome you intend to reach and the work required to reach it. Create your first one to begin." />}</p>
        <Link className="button" href={query ? "/app#mission-search" : "/app/missions/new"}><LocalizedText en={query ? "Clear search" : "Create mission"} /></Link>
      </div>}
  </div>;
}

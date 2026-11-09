import Link from "next/link";
import { MissionCard } from "../../../components/mission-card";
import { LocalizedText } from "../../../components/localized-text";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";
import { getTranslate } from "../../../lib/i18n-server";
import { fill } from "../../../lib/i18n";

export default async function BusinessWorkspacePage() {
  const t = await getTranslate();
  const repository = isSupabaseConfigured()
    ? await createSupabaseMissionRepository()
    : localMockMissionRepository;
  const missions = await repository.listMissions();
  const active = missions.filter((mission) => mission.status === "ACTIVE");
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const completed = missions.filter((mission) => mission.status === "COMPLETED");
  const withoutActions = missions.filter((mission) => mission.actionsTotal === 0);
  const recent = missions.slice(0, 3);
  const focus = waiting.length ? waiting.slice(0, 3) : withoutActions.slice(0, 3);
  const focusType = waiting.length ? "waiting" : withoutActions.length ? "planning" : "clear";

  return <div className="container business-dashboard">
    <section className="section-heading business-hero">
      <div>
        <p className="eyebrow"><LocalizedText en="Business workspace" /></p>
        <h1><LocalizedText en="Run AI work with clear boundaries." /></h1>
        <p><LocalizedText en="A clear view of active work, decisions that need you, and the next best action." /></p>
      </div>
      <Link className="button business-primary-cta" href="/app/missions/new"><span aria-hidden="true">＋</span> <LocalizedText en="New mission" /></Link>
    </section>

    <section className="business-metrics" aria-label={t("Business workspace metrics")}>
      <Link className="business-metric business-metric-total" href="/app">
        <span className="business-metric-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h10" /></svg></span>
        <span className="business-metric-copy"><strong>{missions.length}</strong><span><LocalizedText en="Total missions" /></span></span>
        <span className="business-metric-arrow" aria-hidden="true">↗</span>
      </Link>
      <Link className="business-metric business-metric-active" href="/app?status=ACTIVE">
        <span className="business-metric-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V12M10 19V5M16 19V9M22 19V3" /></svg></span>
        <span className="business-metric-copy"><strong>{active.length}</strong><span><LocalizedText en="Active" /></span></span>
        <span className="business-metric-arrow" aria-hidden="true">↗</span>
      </Link>
      <Link className="business-metric business-metric-waiting" href="/app?status=WAITING">
        <span className="business-metric-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg></span>
        <span className="business-metric-copy"><strong>{waiting.length}</strong><span><LocalizedText en="Needs your input" /></span></span>
        <span className="business-metric-arrow" aria-hidden="true">↗</span>
      </Link>
      <Link className="business-metric business-metric-completed" href="/app?status=COMPLETED">
        <span className="business-metric-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7" /></svg></span>
        <span className="business-metric-copy"><strong>{completed.length}</strong><span><LocalizedText en="Completed" /></span></span>
        <span className="business-metric-arrow" aria-hidden="true">↗</span>
      </Link>
    </section>

    <section className={`business-focus business-focus-${focusType}`} aria-labelledby="business-focus-heading">
      <div className="business-focus-heading">
        <span className="business-focus-icon" aria-hidden="true">{focusType === "waiting" ? "!" : focusType === "planning" ? "↗" : "✓"}</span>
        <div>
          <p className="eyebrow"><LocalizedText en="Recommended next step" /></p>
          <h2 id="business-focus-heading">
            {focusType === "waiting"
              ? <>{fill(t(waiting.length === 1 ? "{count} mission needs your decision" : "{count} missions need your decision"), { count: waiting.length })}</>
              : focusType === "planning"
                ? <>{fill(t(withoutActions.length === 1 ? "{count} mission needs a first step" : "{count} missions need a first step"), { count: withoutActions.length })}</>
                : <LocalizedText en="Your mission board is clear" />}
          </h2>
          <p>{focusType === "waiting"
            ? <LocalizedText en="Resolve blockers before starting more work." />
            : focusType === "planning"
              ? <LocalizedText en="Give each mission a concrete action so progress is visible." />
              : <LocalizedText en="Review progress, then choose the outcome with the most value." />}</p>
        </div>
      </div>
      {focus.length > 0
        ? <div className="business-focus-list">{focus.map((mission) => <Link href={`/app/missions/${mission.id}`} key={mission.id} className="business-focus-item">
            <span className="business-focus-item-copy"><strong>{mission.name}</strong><small>{mission.actionsCompleted} / {mission.actionsTotal} <LocalizedText en="actions complete" /></small></span>
            <span className="business-focus-open"><LocalizedText en="Review" /> <span aria-hidden="true">→</span></span>
          </Link>)}</div>
        : <Link className="button button-quiet" href="/app"><LocalizedText en="Review missions" /></Link>}
    </section>

    <section className="business-shortcuts" aria-labelledby="business-shortcuts-heading">
      <div className="business-section-heading">
        <div><p className="eyebrow"><LocalizedText en="Keep moving" /></p><h2 id="business-shortcuts-heading"><LocalizedText en="Quick actions" /></h2></div>
      </div>
      <div className="business-shortcut-grid">
        <Link className="business-shortcut" href="/app/missions/new">
          <span className="business-shortcut-icon shortcut-navy" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>
          <span><strong><LocalizedText en="Create a mission" /></strong><small><LocalizedText en="Start with a clear outcome" /></small></span><span className="business-shortcut-arrow">→</span>
        </Link>
        <Link className="business-shortcut" href="/templates">
          <span className="business-shortcut-icon shortcut-teal" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span>
          <span><strong><LocalizedText en="Start from a template" /></strong><small><LocalizedText en="Skip the blank-page setup" /></small></span><span className="business-shortcut-arrow">→</span>
        </Link>
        <Link className="business-shortcut" href="/app/opportunities">
          <span className="business-shortcut-icon shortcut-amber" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V12M10 19V5M16 19V9M22 19V3"/></svg></span>
          <span><strong><LocalizedText en="Evaluate an opportunity" /></strong><small><LocalizedText en="Compare ideas before committing" /></small></span><span className="business-shortcut-arrow">→</span>
        </Link>
        <Link className="business-shortcut" href="/app/notifications">
          <span className="business-shortcut-icon shortcut-blue" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span>
          <span><strong><LocalizedText en="Review notifications" /></strong><small><LocalizedText en="Find follow-ups and open decisions" /></small></span><span className="business-shortcut-arrow">→</span>
        </Link>
      </div>
    </section>

    <section className="business-team-note">
      <span className="business-team-icon" aria-hidden="true">◎</span>
      <div><strong><LocalizedText en="Team collaboration is in development" /></strong><p><LocalizedText en="Missions work in your private workspace today. Secure invitations, team roles, and shared business access are not enabled yet." /></p></div>
      <span className="business-coming-soon"><LocalizedText en="In development" /></span>
    </section>

    <section className="business-recent" aria-labelledby="business-recent-heading">
      <div className="business-section-heading">
        <div><p className="eyebrow"><LocalizedText en="Your latest activity" /></p><h2 id="business-recent-heading"><LocalizedText en="Recent missions" /></h2><p><LocalizedText en="Pick up where you left off." /></p></div>
        <Link className="button button-quiet" href="/app"><LocalizedText en="View all missions" /> <span aria-hidden="true">→</span></Link>
      </div>
      {recent.length
        ? <div className="grid business-recent-grid">{recent.map((mission) => <MissionCard key={mission.id} mission={mission} progressLabel={fill(t("Mission progress for {mission}"), { mission: mission.name })} />)}</div>
        : <div className="empty-state"><h2><LocalizedText en="Your workspace is ready" /></h2><p><LocalizedText en="Create your first mission to start tracking a concrete outcome." /></p><Link className="button" href="/app/missions/new"><LocalizedText en="Create first mission" /></Link></div>}
    </section>
  </div>;
}

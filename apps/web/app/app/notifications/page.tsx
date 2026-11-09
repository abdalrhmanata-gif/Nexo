import Link from "next/link";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";
import { LocalizedText } from "../../../components/localized-text";
import { planIsThin } from "../../../lib/mission-critique.mjs";

export default async function NotificationsPage() {
  const repository = isSupabaseConfigured()
    ? await createSupabaseMissionRepository()
    : localMockMissionRepository;
  const missions = await repository.listMissions();
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const now = Date.now();
  const dueWindow = now + 7 * 24 * 60 * 60 * 1000;
  const followUps = missions.flatMap((mission) => mission.actions
    .filter((action) => {
      if (!action.followUpAt || action.status === "COMPLETED" || action.status === "CANCELLED") return false;
      const due = Date.parse(action.followUpAt);
      return Number.isFinite(due) && due <= dueWindow;
    })
    .map((action) => ({
      id: action.id, missionId: mission.id, missionName: mission.name,
      title: action.title, dueAt: action.followUpAt as string,
      overdue: Date.parse(action.followUpAt as string) < now,
    })))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  // The badge counts these, so the page has to explain them. A mission that
  // states an outcome and holds no work is the easiest one to lose, and it
  // never appears under "waiting" or "due" because it has nothing to be late.
  const unplanned = missions.filter((mission) => mission.status !== "COMPLETED" && planIsThin(mission));

  return <div className="container notifications-page">
    <section className="section-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Workspace updates" /></p>
        <h1><LocalizedText en="Notifications" /></h1>
        <p><LocalizedText en="Missions and follow-ups that need your attention." /></p>
      </div>
      <span className="notification-summary"><strong>{waiting.length + followUps.length + unplanned.length}</strong> <LocalizedText en="need attention" /></span>
    </section>

    <section className="card notification-section">
      <p className="eyebrow"><LocalizedText en="Your input" /></p>
      <h2><LocalizedText en="Missions waiting for you" /></h2>
      {waiting.length ? <ul className="list">{waiting.map((mission) => <li key={mission.id}>
        <div className="notification-item">
          <div><strong>{mission.name}</strong><p className="action-hint">{mission.intent}</p></div>
          <Link className="button button-small" href={`/app/missions/${mission.id}`}><LocalizedText en="Review mission" /></Link>
        </div>
      </li>)}</ul> : <p className="detail-intent"><LocalizedText en="No missions are waiting for your input." /></p>}
    </section>

    <section className="card notification-section">
      <p className="eyebrow"><LocalizedText en="Follow-up" /></p>
      <h2><LocalizedText en="Due and overdue tasks" /></h2>
      {followUps.length ? <ul className="list">{followUps.map((item) => <li key={item.id}>
        <div className="notification-item">
          <div><strong>{item.title}</strong><p className="action-hint">{item.missionName}</p>
            <p className="action-hint"><span className={item.overdue ? "status status-waiting" : "status status-active"}><LocalizedText en={item.overdue ? "Overdue" : "Due within 7 days"} /></span> · {new Date(item.dueAt).toLocaleString()}</p>
          </div>
          <Link className="button button-small" href={`/app/missions/${item.missionId}`}><LocalizedText en="Open task" /></Link>
        </div>
      </li>)}</ul> : <p className="detail-intent"><LocalizedText en="No follow-up tasks are overdue or due in the next 7 days." /></p>}
    </section>
    <section className="card notification-section">
      <p className="eyebrow"><LocalizedText en="Nothing planned" /></p>
      <h2><LocalizedText en="Missions with no work behind them" /></h2>
      {unplanned.length ? <ul className="list">{unplanned.map((mission) => <li key={mission.id}>
        <div className="notification-item">
          <div>
            <strong>{mission.name}</strong>
            <p className="action-hint"><LocalizedText en="This mission states an outcome but holds no step that would reach it." /></p>
          </div>
          <Link className="button button-small" href={`/app/missions/${mission.id}`}><LocalizedText en="Plan it" /></Link>
        </div>
      </li>)}</ul> : <p className="detail-intent"><LocalizedText en="Every mission has at least one step behind it." /></p>}
    </section>

    <p><Link className="button button-quiet" href="/app"><LocalizedText en="Back to workspace" /></Link></p>
  </div>;
}

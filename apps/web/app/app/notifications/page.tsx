import Link from "next/link";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";
import { LocalizedText } from "../../../components/localized-text";

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

  return <div className="container notifications-page">
    <section className="section-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Workspace updates" nb="Oppdateringer" ar="تحديثات مساحة العمل" /></p>
        <h1><LocalizedText en="Notifications" nb="Varsler" ar="الإشعارات" /></h1>
        <p><LocalizedText en="Missions and follow-ups that need your attention." nb="Oppdrag og oppfølginger som krever oppmerksomhet." ar="المهام والمتابعات التي تتطلب انتباهك." /></p>
      </div>
      <span className="notification-summary"><strong>{waiting.length + followUps.length}</strong> <LocalizedText en="need attention" nb="krever oppmerksomhet" ar="تحتاج إلى اهتمام" /></span>
    </section>

    <section className="card notification-section">
      <p className="eyebrow"><LocalizedText en="Your input" nb="Din avklaring" ar="مطلوب منك" /></p>
      <h2><LocalizedText en="Missions waiting for you" nb="Oppdrag som venter på deg" ar="مهام بانتظارك" /></h2>
      {waiting.length ? <ul className="list">{waiting.map((mission) => <li key={mission.id}>
        <div className="notification-item">
          <div><strong>{mission.name}</strong><p className="action-hint">{mission.intent}</p></div>
          <Link className="button button-small" href={`/app/missions/${mission.id}`}><LocalizedText en="Review mission" nb="Gjennomgå oppdrag" ar="راجع المهمة" /></Link>
        </div>
      </li>)}</ul> : <p className="detail-intent"><LocalizedText en="No missions are waiting for your input." nb="Ingen oppdrag venter på avklaring." ar="لا توجد مهام تنتظر توجيهك." /></p>}
    </section>

    <section className="card notification-section">
      <p className="eyebrow"><LocalizedText en="Follow-up" nb="Oppfølging" ar="المتابعة" /></p>
      <h2><LocalizedText en="Due and overdue tasks" nb="Oppgaver som forfaller" ar="المهام المستحقة والمتأخرة" /></h2>
      {followUps.length ? <ul className="list">{followUps.map((item) => <li key={item.id}>
        <div className="notification-item">
          <div><strong>{item.title}</strong><p className="action-hint">{item.missionName}</p>
            <p className="action-hint"><span className={item.overdue ? "status status-waiting" : "status status-active"}><LocalizedText en={item.overdue ? "Overdue" : "Due within 7 days"} nb={item.overdue ? "Forfalt" : "Innen 7 dager"} ar={item.overdue ? "متأخرة" : "خلال 7 أيام"} /></span> · {new Date(item.dueAt).toLocaleString()}</p>
          </div>
          <Link className="button button-small" href={`/app/missions/${item.missionId}`}><LocalizedText en="Open task" nb="Åpne oppgave" ar="افتح المهمة" /></Link>
        </div>
      </li>)}</ul> : <p className="detail-intent"><LocalizedText en="No follow-up tasks are overdue or due in the next 7 days." nb="Ingen oppfølgingsoppgaver er forfalt eller forfaller de neste 7 dagene." ar="لا توجد متابعات متأخرة أو مستحقة خلال الأيام السبعة القادمة." /></p>}
    </section>
    <p><Link className="button button-quiet" href="/app"><LocalizedText en="Back to workspace" nb="Tilbake til arbeidsområdet" ar="العودة إلى مساحة العمل" /></Link></p>
  </div>;
}

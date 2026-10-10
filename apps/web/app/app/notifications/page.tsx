import Link from "next/link";
import { LocalizedText } from "../../../components/localized-text";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";

export default async function NotificationsPage() {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const [missions, approvals] = await Promise.all([
    repository.listMissions(),
    repository.listPendingApprovals ? repository.listPendingApprovals() : Promise.resolve([]),
  ]);
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const now = Date.now();
  const followUpWindow = now + 7 * 24 * 60 * 60 * 1000;
  const followUps = missions.flatMap((mission) => mission.actions
    .filter((action) => {
      if (!action.followUpAt || action.status === "COMPLETED" || action.status === "CANCELLED") return false;
      const dueAt = Date.parse(action.followUpAt);
      return Number.isFinite(dueAt) && dueAt <= followUpWindow;
    })
    .map((action) => ({
      id: action.id,
      missionId: mission.id,
      missionName: mission.name,
      title: action.title,
      dueAt: action.followUpAt as string,
      overdue: Date.parse(action.followUpAt as string) < now,
    })))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const attentionCount = waiting.length + approvals.length + followUps.length;

  return <div className="container notifications-page">
    <section className="section-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Workspace updates" nb="Oppdateringer i arbeidsområdet" ar="تحديثات مساحة العمل" /></p>
        <h1><LocalizedText en="Notifications" nb="Varsler" ar="الإشعارات" /></h1>
        <p><LocalizedText en="A focused view of missions and decisions that need your attention." nb="En oversikt over oppdrag og beslutninger som krever oppmerksomhet." ar="نظرة مركزة على المهام والقرارات التي تحتاج إلى اهتمامك." /></p>
      </div>
      <span className="notification-summary"><strong>{attentionCount}</strong> <LocalizedText en="need attention" nb="krever oppmerksomhet" ar="تحتاج إلى اهتمام" /></span>
    </section>

    <section className="card notification-section">
      <p className="eyebrow"><LocalizedText en="Your input" nb="Din avklaring" ar="مطلوب منك" /></p>
      <h2><LocalizedText en="Missions waiting for you" nb="Oppdrag som venter på deg" ar="مهام بانتظارك" /></h2>
      {waiting.length ? <ul className="list">{waiting.map((mission) => <li key={mission.id}>
        <div className="notification-item">
          <div><strong>{mission.name}</strong><p className="action-hint">{mission.intent}</p></div>
          <Link className="button button-small" href={`/app/missions/${mission.id}`}><LocalizedText en="Review mission" nb="Se gjennom oppdraget" ar="راجع المهمة" /></Link>
        </div>
      </li>)}</ul> : <p className="detail-intent"><LocalizedText en="You’re all caught up. No missions are waiting for your input." nb="Alt er oppdatert. Ingen oppdrag venter på avklaring." ar="أنت على اطلاع. لا توجد مهام تنتظر توجيهك." /></p>}
    </section>

    <section className="card notification-section">
      <p className="eyebrow"><LocalizedText en="Follow-up" nb="Oppfølging" ar="المتابعة" /></p>
      <h2><LocalizedText en="Due and overdue tasks" nb="Oppgaver som forfaller" ar="المهام المستحقة والمتأخرة" /></h2>
      {followUps.length ? <ul className="list">{followUps.map((followUp) => <li key={followUp.id}>
        <div className="notification-item">
          <div>
            <strong>{followUp.title}</strong>
            <p className="action-hint">{followUp.missionName}</p>
            <p className="action-hint"><span className={followUp.overdue ? "status status-waiting" : "status status-active"}><LocalizedText en={followUp.overdue ? "Overdue" : "Due within 7 days"} nb={followUp.overdue ? "Forfalt" : "Innen 7 dager"} ar={followUp.overdue ? "متأخرة" : "خلال 7 أيام"} /></span> · {new Date(followUp.dueAt).toLocaleString()}</p>
          </div>
          <Link className="button button-small" href={`/app/missions/${followUp.missionId}`}><LocalizedText en="Open task" nb="Åpne oppgaven" ar="افتح المهمة" /></Link>
        </div>
      </li>)}</ul> : <p className="detail-intent"><LocalizedText en="No follow-up tasks are overdue or due within the next 7 days." nb="Ingen oppfølgingsoppgaver er forfalt eller forfaller i løpet av de neste 7 dagene." ar="لا توجد مهام متابعة متأخرة أو مستحقة خلال الأيام السبعة القادمة." /></p>}
    </section>

    <section className="card notification-section">
      <p className="eyebrow"><LocalizedText en="Authority" nb="Tilgang" ar="الصلاحيات" /></p>
      <h2><LocalizedText en="Pending approvals" nb="Ventende godkjenninger" ar="الموافقات المعلّقة" /></h2>
      {approvals.length ? <ul className="list">{approvals.map((approval) => <li key={approval.id}>
        <div className="notification-item">
          <div><strong><LocalizedText en={approval.missionName || "Mission approval"} /></strong><p className="action-hint"><LocalizedText en={approval.actionTitle || "A human decision is needed before this action can proceed."} /></p><p className="action-hint">{new Date(approval.createdAt).toLocaleString()}</p></div>
          <Link className="button button-small" href="/app/business/approvals"><LocalizedText en="Review approval" nb="Se gjennom godkjenningen" ar="راجع الموافقة" /></Link>
        </div>
      </li>)}</ul> : <p className="detail-intent"><LocalizedText en="No approval decisions are waiting. Actions requiring approval remain blocked until an authorized person decides." nb="Ingen godkjenninger venter. Handlinger som krever godkjenning forblir blokkert til en autorisert person bestemmer." ar="لا توجد موافقات معلّقة. تبقى الإجراءات التي تتطلب موافقة محظورة حتى يتخذ شخص مخوّل القرار." /></p>}
    </section>

    <p><Link className="button button-quiet" href="/app"><LocalizedText en="Back to workspace" nb="Tilbake til arbeidsområdet" ar="العودة إلى مساحة العمل" /></Link></p>
  </div>;
}

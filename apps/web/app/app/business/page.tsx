import Link from "next/link";
import { MissionCard } from "../../../components/mission-card";
import { LocalizedText } from "../../../components/localized-text";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";

export default async function BusinessWorkspacePage() {
  const repository = isSupabaseConfigured()
    ? await createSupabaseMissionRepository()
    : localMockMissionRepository;
  const missions = await repository.listMissions();
  const active = missions.filter((mission) => mission.status === "ACTIVE");
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const completed = missions.filter((mission) => mission.status === "COMPLETED");
  const recent = [...missions].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 3);

  return <div className="container business-dashboard">
    <section className="section-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Business workspace" nb="Arbeidsområde for bedrifter" ar="مساحة عمل الشركات" /></p>
        <h1><LocalizedText en="Run AI work with clear boundaries." nb="Organiser KI-arbeid med tydelige rammer." ar="أدر عمل الذكاء الاصطناعي ضمن حدود واضحة." /></h1>
        <p><LocalizedText en="Review active missions, resolve blockers, and keep the work tied to explicit outcomes." nb="Følg aktive oppdrag, løs hindringer og knytt arbeidet til tydelige resultater." ar="راجع المهام النشطة وعالج العوائق واربط العمل بنتائج واضحة." /></p>
      </div>
      <Link className="button" href="/app/missions/new"><LocalizedText en="New mission" nb="Nytt oppdrag" ar="مهمة جديدة" /></Link>
    </section>

    <div className="stats business-stats" aria-label="Business workspace metrics">
      <div className="stat"><strong>{missions.length}</strong><span><LocalizedText en="Total missions" nb="Oppdrag totalt" ar="إجمالي المهام" /></span></div>
      <div className="stat"><strong>{active.length}</strong><span><LocalizedText en="Active" nb="Aktive" ar="نشطة" /></span></div>
      <div className="stat"><strong>{waiting.length}</strong><span><LocalizedText en="Needs your input" nb="Trenger avklaring" ar="تحتاج تدخلك" /></span></div>
      <div className="stat"><strong>{completed.length}</strong><span><LocalizedText en="Completed" nb="Fullførte" ar="مكتملة" /></span></div>
    </div>

    <section className="card business-invite-panel" aria-labelledby="invite-teammate-heading">
      <p className="eyebrow"><LocalizedText en="Team access" nb="Teamtilgang" ar="وصول الفريق" /></p>
      <h2 id="invite-teammate-heading"><LocalizedText en="Invite a teammate" nb="Inviter en kollega" ar="دعوة زميل إلى الفريق" /></h2>
      <p><LocalizedText en="Secure email invitations and membership management are not enabled in this deployment. This control stays unavailable rather than pretending to send an invitation." nb="Sikre e-postinvitasjoner og medlemsadministrasjon er ikke aktivert i denne utrullingen. Funksjonen er deaktivert i stedet for å late som om en invitasjon sendes." ar="دعوات البريد الإلكتروني الآمنة وإدارة العضوية غير مفعّلة في هذا الإصدار. نُبقي الوظيفة معطلة بدلًا من الادعاء بإرسال دعوة." /></p>
      <button className="button" type="button" disabled aria-disabled="true"><LocalizedText en="Invitations not enabled" nb="Invitasjoner er ikke aktivert" ar="الدعوات غير مفعّلة" /></button>
      <p className="action-hint"><LocalizedText en="No invitation is sent and no team member is added from this page." nb="Ingen invitasjon sendes, og ingen teammedlem legges til fra denne siden." ar="لن تُرسل دعوة ولن يُضاف أي عضو من هذه الصفحة." /></p>
    </section>

    <div className="section-heading business-recent-heading">
      <div><h2><LocalizedText en="Recent missions" nb="Nylige oppdrag" ar="المهام الأخيرة" /></h2><p><LocalizedText en="The latest work in your authenticated workspace." nb="Det nyeste arbeidet i arbeidsområdet ditt." ar="أحدث الأعمال في مساحة عملك." /></p></div>
      <Link className="button button-quiet" href="/app"><LocalizedText en="Open workspace" nb="Åpne arbeidsområdet" ar="افتح مساحة العمل" /></Link>
    </div>
    {recent.length
      ? <div className="grid">{recent.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div>
      : <div className="empty-state"><h2><LocalizedText en="No missions yet" nb="Ingen oppdrag ennå" ar="لا توجد مهام بعد" /></h2><p><LocalizedText en="Create a mission to start tracking a concrete outcome." nb="Opprett et oppdrag for å følge et konkret resultat." ar="أنشئ مهمة لبدء متابعة نتيجة محددة." /></p><Link className="button" href="/app/missions/new"><LocalizedText en="Create mission" nb="Opprett oppdrag" ar="أنشئ مهمة" /></Link></div>}
  </div>;
}

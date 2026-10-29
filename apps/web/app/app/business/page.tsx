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
  const withoutActions = missions.filter((mission) => mission.actionsTotal === 0);
  const recent = missions.slice(0, 3);
  const focus = waiting.length ? waiting.slice(0, 3) : withoutActions.slice(0, 3);
  const focusType = waiting.length ? "waiting" : withoutActions.length ? "planning" : "clear";

  return <div className="container business-dashboard">
    <section className="section-heading business-hero">
      <div>
        <p className="eyebrow"><LocalizedText en="Business workspace" nb="Arbeidsområde for bedrifter" ar="مساحة عمل الشركات" /></p>
        <h1><LocalizedText en="Run AI work with clear boundaries." nb="Organiser KI-arbeid med tydelige rammer." ar="أدر عمل الذكاء الاصطناعي ضمن حدود واضحة." /></h1>
        <p><LocalizedText en="A clear view of active work, decisions that need you, and the next best action." nb="Få oversikt over aktivt arbeid, beslutninger som krever deg, og neste beste handling." ar="رؤية واضحة للعمل النشط والقرارات التي تحتاجك والخطوة التالية." /></p>
      </div>
      <Link className="button business-primary-cta" href="/app/missions/new"><span aria-hidden="true">＋</span> <LocalizedText en="New mission" nb="Nytt oppdrag" ar="مهمة جديدة" /></Link>
    </section>

    <section className="business-metrics" aria-label="Business workspace metrics">
      <Link className="business-metric business-metric-total" href="/app">
        <span className="business-metric-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h10" /></svg></span>
        <span className="business-metric-copy"><strong>{missions.length}</strong><span><LocalizedText en="Total missions" nb="Oppdrag totalt" ar="إجمالي المهام" /></span></span>
        <span className="business-metric-arrow" aria-hidden="true">↗</span>
      </Link>
      <Link className="business-metric business-metric-active" href="/app?status=ACTIVE">
        <span className="business-metric-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V12M10 19V5M16 19V9M22 19V3" /></svg></span>
        <span className="business-metric-copy"><strong>{active.length}</strong><span><LocalizedText en="Active" nb="Aktive" ar="نشطة" /></span></span>
        <span className="business-metric-arrow" aria-hidden="true">↗</span>
      </Link>
      <Link className="business-metric business-metric-waiting" href="/app?status=WAITING">
        <span className="business-metric-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg></span>
        <span className="business-metric-copy"><strong>{waiting.length}</strong><span><LocalizedText en="Needs your input" nb="Trenger avklaring" ar="تحتاج تدخلك" /></span></span>
        <span className="business-metric-arrow" aria-hidden="true">↗</span>
      </Link>
      <Link className="business-metric business-metric-completed" href="/app?status=COMPLETED">
        <span className="business-metric-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7" /></svg></span>
        <span className="business-metric-copy"><strong>{completed.length}</strong><span><LocalizedText en="Completed" nb="Fullførte" ar="مكتملة" /></span></span>
        <span className="business-metric-arrow" aria-hidden="true">↗</span>
      </Link>
    </section>

    <section className={`business-focus business-focus-${focusType}`} aria-labelledby="business-focus-heading">
      <div className="business-focus-heading">
        <span className="business-focus-icon" aria-hidden="true">{focusType === "waiting" ? "!" : focusType === "planning" ? "↗" : "✓"}</span>
        <div>
          <p className="eyebrow"><LocalizedText en="Recommended next step" nb="Anbefalt neste steg" ar="الخطوة التالية المقترحة" /></p>
          <h2 id="business-focus-heading">
            {focusType === "waiting"
              ? <LocalizedText en={`${waiting.length} ${waiting.length === 1 ? "mission needs" : "missions need"} your decision`} nb={`${waiting.length} oppdrag trenger avklaring`} ar={`${waiting.length} مهمة تحتاج قرارك`} />
              : focusType === "planning"
                ? <LocalizedText en={`${withoutActions.length} ${withoutActions.length === 1 ? "mission needs" : "missions need"} a first step`} nb={`${withoutActions.length} oppdrag trenger et første steg`} ar={`${withoutActions.length} مهمة تحتاج إلى خطوة أولى`} />
                : <LocalizedText en="Your mission board is clear" nb="Oppdragsoversikten er ryddig" ar="لوحة المهام واضحة" />}
          </h2>
          <p>{focusType === "waiting"
            ? <LocalizedText en="Resolve blockers before starting more work." nb="Løs hindringer før du starter mer arbeid." ar="عالج العوائق قبل بدء المزيد من العمل." />
            : focusType === "planning"
              ? <LocalizedText en="Give each mission a concrete action so progress is visible." nb="Legg til en konkret handling slik at fremdriften blir synlig." ar="أضف إجراءً واضحًا لكل مهمة لإظهار التقدم." />
              : <LocalizedText en="Review progress, then choose the outcome with the most value." nb="Gå gjennom fremdriften og velg deretter resultatet med størst verdi." ar="راجع التقدم ثم اختر النتيجة الأعلى قيمة." />}</p>
        </div>
      </div>
      {focus.length > 0
        ? <div className="business-focus-list">{focus.map((mission) => <Link href={`/app/missions/${mission.id}`} key={mission.id} className="business-focus-item">
            <span className="business-focus-item-copy"><strong>{mission.name}</strong><small>{mission.actionsCompleted} / {mission.actionsTotal} <LocalizedText en="actions complete" nb="handlinger fullført" ar="إجراءات مكتملة" /></small></span>
            <span className="business-focus-open"><LocalizedText en="Review" nb="Se gjennom" ar="مراجعة" /> <span aria-hidden="true">→</span></span>
          </Link>)}</div>
        : <Link className="button button-quiet" href="/app"><LocalizedText en="Review missions" nb="Gå gjennom oppdrag" ar="راجع المهام" /></Link>}
    </section>

    <section className="business-shortcuts" aria-labelledby="business-shortcuts-heading">
      <div className="business-section-heading">
        <div><p className="eyebrow"><LocalizedText en="Keep moving" nb="Kom videre" ar="واصل التقدم" /></p><h2 id="business-shortcuts-heading"><LocalizedText en="Quick actions" nb="Hurtighandlinger" ar="إجراءات سريعة" /></h2></div>
      </div>
      <div className="business-shortcut-grid">
        <Link className="business-shortcut" href="/app/missions/new">
          <span className="business-shortcut-icon shortcut-navy" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>
          <span><strong><LocalizedText en="Create a mission" nb="Opprett et oppdrag" ar="أنشئ مهمة" /></strong><small><LocalizedText en="Start with a clear outcome" nb="Start med et tydelig resultat" ar="ابدأ بنتيجة واضحة" /></small></span><span className="business-shortcut-arrow">→</span>
        </Link>
        <Link className="business-shortcut" href="/templates">
          <span className="business-shortcut-icon shortcut-teal" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span>
          <span><strong><LocalizedText en="Start from a template" nb="Start med en mal" ar="ابدأ بقالب" /></strong><small><LocalizedText en="Skip the blank-page setup" nb="Hopp over tomt skjema" ar="تجاوز إعداد الصفحة الفارغة" /></small></span><span className="business-shortcut-arrow">→</span>
        </Link>
        <Link className="business-shortcut" href="/app/opportunities">
          <span className="business-shortcut-icon shortcut-amber" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V12M10 19V5M16 19V9M22 19V3"/></svg></span>
          <span><strong><LocalizedText en="Evaluate an opportunity" nb="Vurder en mulighet" ar="قيّم فرصة" /></strong><small><LocalizedText en="Compare ideas before committing" nb="Sammenlign ideer før du bestemmer deg" ar="قارن الأفكار قبل الالتزام" /></small></span><span className="business-shortcut-arrow">→</span>
        </Link>
        <Link className="business-shortcut" href="/app/notifications">
          <span className="business-shortcut-icon shortcut-blue" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span>
          <span><strong><LocalizedText en="Review notifications" nb="Se gjennom varsler" ar="راجع الإشعارات" /></strong><small><LocalizedText en="Find follow-ups and open decisions" nb="Finn oppfølginger og åpne beslutninger" ar="اعثر على المتابعات والقرارات المفتوحة" /></small></span><span className="business-shortcut-arrow">→</span>
        </Link>
      </div>
    </section>

    <section className="business-team-note">
      <span className="business-team-icon" aria-hidden="true">◎</span>
      <div><strong><LocalizedText en="Team collaboration is in development" nb="Samarbeid i team er under utvikling" ar="التعاون بين أعضاء الفريق قيد التطوير" /></strong><p><LocalizedText en="Missions work in your private workspace today. Secure invitations, team roles, and shared business access are not enabled yet." nb="Oppdrag fungerer i ditt private arbeidsområde i dag. Sikre invitasjoner, teamroller og delt bedriftstilgang er ikke aktivert ennå." ar="تعمل المهام في مساحة عملك الخاصة حاليًا. الدعوات الآمنة وأدوار الفريق والوصول المشترك للشركات غير مفعّلة بعد." /></p></div>
      <span className="business-coming-soon"><LocalizedText en="In development" nb="Under utvikling" ar="قيد التطوير" /></span>
    </section>

    <section className="business-recent" aria-labelledby="business-recent-heading">
      <div className="business-section-heading">
        <div><p className="eyebrow"><LocalizedText en="Your latest activity" nb="Siste aktivitet" ar="أحدث نشاطك" /></p><h2 id="business-recent-heading"><LocalizedText en="Recent missions" nb="Nylige oppdrag" ar="المهام الأخيرة" /></h2><p><LocalizedText en="Pick up where you left off." nb="Fortsett der du slapp." ar="تابع من حيث توقفت." /></p></div>
        <Link className="button button-quiet" href="/app"><LocalizedText en="View all missions" nb="Se alle oppdrag" ar="عرض كل المهام" /> <span aria-hidden="true">→</span></Link>
      </div>
      {recent.length
        ? <div className="grid business-recent-grid">{recent.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div>
        : <div className="empty-state"><h2><LocalizedText en="Your workspace is ready" nb="Arbeidsområdet er klart" ar="مساحة العمل جاهزة" /></h2><p><LocalizedText en="Create your first mission to start tracking a concrete outcome." nb="Opprett ditt første oppdrag for å følge et konkret resultat." ar="أنشئ مهمتك الأولى لمتابعة نتيجة واضحة." /></p><Link className="button" href="/app/missions/new"><LocalizedText en="Create first mission" nb="Opprett første oppdrag" ar="أنشئ المهمة الأولى" /></Link></div>}
    </section>
  </div>;
}

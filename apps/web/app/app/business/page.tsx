import Link from "next/link";
import { LocalizedText } from "../../../components/localized-text";
import { MissionCard } from "../../../components/mission-card";
import { ApprovalDecisionControls } from "../../../components/approval-decision-controls";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { InvitationRevokeButton } from "../../../components/invitation-revoke-button";
import { MemberManagementControls } from "../../../components/member-management-controls";
import { humaniseEventType, summariseApprovalScope, summariseEventPayload } from "../../../lib/mission-content.mjs";

export default async function BusinessWorkspacePage() {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const missions = await repository.listMissions();
  const active = missions.filter((mission) => mission.status === "ACTIVE");
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const completed = missions.filter((mission) => mission.status === "COMPLETED");
  const verified = missions.filter((mission) => mission.verifications.some((item) => item.status === "VERIFIED"));
  const recent = [...missions].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 3);
  const agents = repository.listWorkspaceAgents ? await repository.listWorkspaceAgents() : [];
  const members = repository.listWorkspaceMembers ? await repository.listWorkspaceMembers() : [];
  const approvals = repository.listPendingApprovals ? await repository.listPendingApprovals() : [];
  const canDecideApprovals = repository.canDecideApprovals ? await repository.canDecideApprovals() : false;
  const invitations = repository.listWorkspaceInvitations ? await repository.listWorkspaceInvitations() : [];
  const activity = repository.listWorkspaceActivity ? await repository.listWorkspaceActivity() : [];

  return <div className="container business-dashboard">
    <div className="section-heading"><div>
      <p className="eyebrow"><LocalizedText en="Business workspace" nb="Arbeidsområde" ar="مساحة عمل الشركات" /></p>
      <h1><LocalizedText en="Run AI work as a team" nb="Samarbeid om AI-arbeid" ar="أنجز أعمال الذكاء الاصطناعي كفريق" /></h1>
      <p><LocalizedText en="One mission engine for work, approvals, verification, and outcomes. This business workspace uses the same missions you already have." nb="Én oppdragsmotor for arbeid, godkjenninger, verifisering og resultater. Arbeidsområdet bruker de samme oppdragene du allerede har." ar="محرك واحد للمهام والموافقات والتحقق والنتائج، باستخدام المهام نفسها الموجودة لديك." /></p>
    </div><Link className="button" href="/app/missions/new"><LocalizedText en="New mission" nb="Nytt oppdrag" ar="مهمة جديدة" /></Link></div>

    <div className="stats" aria-label="Business workspace metrics">
      <div className="stat"><strong>{members.filter((member) => member.role === "owner").length || 1}</strong><span><LocalizedText en="Workspace owner" nb="Eier av arbeidsområdet" ar="مالك مساحة العمل" /></span></div>
      <div className="stat"><strong>{active.length}</strong><span><LocalizedText en="Active missions" nb="Aktive oppdrag" ar="المهام النشطة" /></span></div>
      <div className="stat"><strong>{waiting.length}</strong><span><LocalizedText en="Needs approval/input" nb="Trenger avklaring" ar="تحتاج إلى موافقة أو توضيح" /></span></div>
      <div className="stat"><strong>{verified.length}</strong><span><LocalizedText en="Verified" nb="Verifisert" ar="تم التحقق" /></span></div>
      <div className="stat"><strong>{approvals.length}</strong><span><LocalizedText en="Pending approvals" nb="Ventende godkjenninger" ar="الموافقات المعلّقة" /></span></div>
    </div>

    <section className="grid">
      <section className="card"><p className="eyebrow"><LocalizedText en="Delegated work" nb="Delegerte oppgaver" ar="العمل المفوّض" /></p><h2><LocalizedText en="Shared mission workspace" nb="Delt oppdragsområde" ar="مساحة مهام مشتركة" /></h2><p><LocalizedText en="Keep the goal, allowed actions, execution history, evidence, and outcome together. Your team gets one source of truth instead of scattered AI chats." nb="Samle mål, tillatte handlinger, historikk, dokumentasjon og resultat. Teamet får én felles sannhetskilde i stedet for spredte KI-chatter." ar="اجمع الهدف والإجراءات المسموح بها وسجل التنفيذ والأدلة والنتيجة في مكان واحد بدلًا من محادثات ذكاء اصطناعي متفرقة." /></p><Link className="button button-small" href="/app"><LocalizedText en="Open mission workspace" nb="Åpne oppdragsområdet" ar="افتح مساحة المهام" /></Link></section>
      <section className="card"><p className="eyebrow"><LocalizedText en="Authority" nb="Fullmakter" ar="الصلاحيات" /></p><h2><LocalizedText en="Approval before external actions" nb="Godkjenning før eksterne handlinger" ar="الموافقة قبل الإجراءات الخارجية" /></h2><p><LocalizedText en="Read-only research is available now. Actions that affect other people or systems remain blocked until the required authority and approval are recorded." nb="Lesebasert research er tilgjengelig nå. Handlinger som påvirker andre personer eller systemer, forblir blokkert til nødvendig fullmakt og godkjenning er registrert." ar="البحث للقراءة فقط متاح الآن. تبقى الإجراءات التي تؤثر في أشخاص أو أنظمة أخرى محظورة حتى تُسجّل الصلاحية والموافقة المطلوبة." /></p><span className="status status-waiting"><LocalizedText en="External actions require explicit approval" nb="Eksterne handlinger krever uttrykkelig godkjenning" ar="الإجراءات الخارجية تتطلب موافقة صريحة" /></span></section>
      <section className="card"><p className="eyebrow"><LocalizedText en="Evidence" nb="Dokumentasjon" ar="الأدلة" /></p><h2><LocalizedText en="Verify before recording success" nb="Verifiser før resultatet registreres" ar="تحقّق قبل تسجيل النجاح" /></h2><p><LocalizedText en="AI results remain unverified until a person records what was checked and the evidence that supports it. Only a passing verification can support a verified outcome." nb="KI-resultater forblir uverifiserte til noen registrerer hva som ble kontrollert og dokumentasjonen som støtter det. Bare en godkjent verifisering kan gi et verifisert resultat." ar="تبقى نتائج الذكاء الاصطناعي غير مؤكدة حتى يسجّل شخص ما تم فحصه والأدلة الداعمة. لا يمكن اعتماد النتيجة إلا بعد اجتياز التحقق." /></p></section>
      <section className="card"><p className="eyebrow"><LocalizedText en="People" nb="Personer" ar="الأشخاص" /></p><h2><LocalizedText en="Team access and roles" nb="Tilgang og roller i teamet" ar="الوصول إلى الفريق والأدوار" /></h2><p><LocalizedText en="Invite teammates by email and assign only the access they need. Owners and admins manage membership; members and viewers receive narrower access." nb="Inviter kolleger via e-post og gi dem bare nødvendig tilgang. Eiere og administratorer styrer medlemskap; medlemmer og lesere får mer begrenset tilgang." ar="ادعُ أعضاء الفريق عبر البريد الإلكتروني وامنحهم الصلاحيات الضرورية فقط. يدير المالكون والمسؤولون العضوية، بينما يحصل الأعضاء والقراء على صلاحيات أضيق." /></p><Link className="button button-small button-quiet" href="/app/business/invite"><LocalizedText en="Invite a teammate" nb="Inviter en kollega" ar="ادعُ زميلًا" /></Link></section>
    </section>

    <section className="grid">
      <section className="card"><p className="eyebrow"><LocalizedText en="Approvals" nb="Godkjenninger" ar="الموافقات" /></p><h2><LocalizedText en="Human control queue" nb="Kø for menneskelig kontroll" ar="قائمة المراجعة البشرية" /></h2>
        <p>{approvals.length ? <LocalizedText en={`${approvals.length} request(s) are waiting for a recorded human decision.`} nb={`${approvals.length} forespørsel(er) venter på en registrert beslutning.`} ar={`${approvals.length} طلب/طلبات تنتظر قرارًا بشريًا مسجّلًا.`} /> : <LocalizedText en="No approvals are waiting. Actions that require approval stay blocked." nb="Ingen godkjenninger venter. Handlinger som krever godkjenning, forblir blokkert." ar="لا توجد موافقات معلّقة. تبقى الإجراءات التي تتطلب موافقة محظورة." />}</p>
        {approvals.length ? <ul className="list">{approvals.slice(0,3).map((approval) => <li key={approval.id}>
          <strong>{approval.missionName || `Mission ${approval.missionId.slice(0,8)}`}</strong><br />
          <span>{approval.actionTitle || <LocalizedText en="Action details unavailable" nb="Handlingsdetaljer er utilgjengelige" ar="تفاصيل الإجراء غير متاحة" />}</span><br />
          <span className="action-hint"><LocalizedText en="Agent:" nb="Agent:" ar="الوكيل:" /> {approval.agentName || <LocalizedText en="Not linked" nb="Ikke koblet" ar="غير مرتبط" />} · <LocalizedText en="Requested by:" nb="Forespurt av:" ar="طلبه:" /> {approval.requesterLabel || <LocalizedText en="Workspace member" nb="Medlem" ar="عضو مساحة العمل" />} · {new Date(approval.createdAt).toLocaleString()}</span><br />
          <span className="action-hint">{summariseApprovalScope(approval.requestedScope)}</span>
          {canDecideApprovals ? <ApprovalDecisionControls approvalId={approval.id} /> : <p className="action-hint"><LocalizedText en="Only owners and admins can decide." nb="Bare eiere og administratorer kan bestemme." ar="يمكن للمالكين والمسؤولين فقط اتخاذ القرار." /></p>}
        </li>)}</ul> : <p className="detail-intent"><LocalizedText en="Actions requiring approval remain blocked until an authorized person decides." nb="Handlinger som krever godkjenning, forblir blokkert til en autorisert person har bestemt." ar="تبقى الإجراءات التي تتطلب موافقة محظورة حتى يقرر شخص مخوّل." /></p>}
        <Link className="button button-small button-quiet" href="/app/business/approvals"><LocalizedText en="Open Human Control Center" nb="Åpne kontrollsenteret" ar="افتح مركز التحكم البشري" /></Link>
      </section>
      <section className="card"><p className="eyebrow"><LocalizedText en="Agents" nb="Agenter" ar="الوكلاء" /></p><h2><LocalizedText en="Controlled AI workers" nb="Kontrollerte KI-agenter" ar="وكلاء ذكاء اصطناعي خاضعون للضوابط" /></h2>
        {agents.length ? <ul className="list">{agents.map((agent) => <li key={agent.id}><strong>{agent.name}</strong><br />{agent.description || <LocalizedText en="Bounded workspace agent" nb="Avgrenset arbeidsområdeagent" ar="وكيل محدود الصلاحيات" />}<br /><span className={`status status-${agent.status.toLowerCase()}`}><LocalizedText en={agent.status} /></span></li>)}</ul> : <p className="detail-intent"><LocalizedText en="No agents are configured yet. When enabled, each agent will have explicit authority and bounded actions." nb="Ingen agenter er konfigurert ennå. Hver agent får uttrykkelige fullmakter og avgrensede handlinger." ar="لم يتم إعداد وكلاء بعد. عند تفعيلهم، سيكون لكل وكيل صلاحيات صريحة وإجراءات محدودة." /></p>}
      </section>
      <section className="card"><p className="eyebrow"><LocalizedText en="People" nb="Personer" ar="الأشخاص" /></p><h2>{members.length} <LocalizedText en="workspace members" nb="medlemmer i arbeidsområdet" ar="أعضاء في مساحة العمل" /></h2>
        <ul className="list">{members.slice(0,8).map((member) => <li key={member.id}><strong>{member.email || <LocalizedText en="Workspace member" nb="Medlem" ar="عضو مساحة العمل" />}</strong><br /><span className="action-hint"><LocalizedText en={member.role} /></span><br /><MemberManagementControls memberId={member.id} currentRole={member.role} /></li>)}</ul>
        <p className="action-hint"><LocalizedText en="Roles: owner, admin, member, viewer." nb="Roller: eier, administrator, medlem, leser." ar="الأدوار: مالك، مسؤول، عضو، قارئ." /></p>
        <h3><LocalizedText en="Invitations" nb="Invitasjoner" ar="الدعوات" /></h3>
        {invitations.length ? <ul className="list">{invitations.slice(0,5).map((invitation) => <li key={invitation.id}><strong>{invitation.email}</strong><br /><span className="action-hint"><LocalizedText en={invitation.role} /> · <LocalizedText en={invitation.status} /> · <LocalizedText en="expires" nb="utløper" ar="تنتهي" /> {new Date(invitation.expiresAt).toLocaleDateString()}</span>{invitation.status === "PENDING" && <div><InvitationRevokeButton invitationId={invitation.id} /></div>}</li>)}</ul> : <p className="detail-intent"><LocalizedText en="No invitations have been created yet." nb="Ingen invitasjoner er opprettet ennå." ar="لم يتم إنشاء دعوات بعد." /></p>}
        <Link className="button button-small" href="/app/business/invite"><LocalizedText en="Invite a teammate" nb="Inviter en kollega" ar="ادعُ زميلًا" /></Link>
      </section>
    </section>
    <section className="card">
      <p className="eyebrow"><LocalizedText en="Audit" nb="Revisjonsspor" ar="سجل التدقيق" /></p><h2><LocalizedText en="Workspace activity" nb="Aktivitet i arbeidsområdet" ar="نشاط مساحة العمل" /></h2>
      <p className="detail-intent"><LocalizedText en="A readable history of collaboration, approvals, agent work, verification, and outcomes." nb="En lesbar historikk over samarbeid, godkjenninger, agentarbeid, verifisering og resultater." ar="سجل واضح للتعاون والموافقات وعمل الوكلاء والتحقق والنتائج." /></p>
      {activity.length ? <ul className="list">{activity.slice(0,12).map((item) => <li key={item.id}><strong>{humaniseEventType(item.eventType)}</strong><br /><span className="action-hint">{summariseEventPayload(item.payload)} · {new Date(item.createdAt).toLocaleString()}</span></li>)}</ul> : <p className="detail-intent"><LocalizedText en="No workspace activity yet." nb="Ingen aktivitet i arbeidsområdet ennå." ar="لا يوجد نشاط في مساحة العمل حتى الآن." /></p>}
    </section>
    <div className="section-heading"><div><h2><LocalizedText en="Recent missions" nb="Nylige oppdrag" ar="المهام الأخيرة" /></h2><p><LocalizedText en="Recent work stays connected to the same execution engine." nb="Nylig arbeid er koblet til den samme oppdragsmotoren." ar="يبقى العمل الأخير مرتبطًا بمحرك التنفيذ نفسه." /></p></div><Link className="button button-quiet" href="/app"><LocalizedText en="View all" nb="Vis alle" ar="عرض الكل" /></Link></div>
    {recent.length ? <div className="grid">{recent.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div> : <div className="empty-state"><h2><LocalizedText en="No missions yet" nb="Ingen oppdrag ennå" ar="لا توجد مهام بعد" /></h2><p><LocalizedText en="Create the first mission to start the workspace." nb="Opprett det første oppdraget for å starte arbeidsområdet." ar="أنشئ المهمة الأولى لبدء مساحة العمل." /></p></div>}
    {completed.length > 0 && <p className="action-hint"><LocalizedText en="Completed missions remain available as history and can later become reusable templates." nb="Fullførte oppdrag beholdes i historikken og kan senere bli gjenbrukbare maler." ar="تبقى المهام المكتملة في السجل ويمكن تحويلها لاحقًا إلى قوالب قابلة لإعادة الاستخدام." /></p>}
  </div>;
}

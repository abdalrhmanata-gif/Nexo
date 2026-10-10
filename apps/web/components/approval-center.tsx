import Link from "next/link";
import { ApprovalDecisionControls } from "./approval-decision-controls";
import { LocalizedText } from "./localized-text";
import { summariseApprovalScope } from "../lib/mission-content.mjs";
import type { MissionApproval } from "../lib/mission-repository";

export function ApprovalCenter({
  approvals,
  canDecide,
}: {
  approvals: MissionApproval[];
  canDecide: boolean;
}) {
  return (
    <section className="grid" aria-label="Pending approval requests">
      {approvals.length ? approvals.map((approval) => (
        <article id={`approval-${approval.id}`} className="card approval-card" key={approval.id}>
          <p className="eyebrow"><LocalizedText en="Approval request · Pending" nb="Godkjenningsforespørsel · Venter" ar="طلب موافقة · معلّق" /></p>
          <h2>{approval.missionName || `Mission ${approval.missionId.slice(0, 8)}`}</h2>
          {approval.missionIntent && <p>{approval.missionIntent}</p>}
          <dl className="approval-details">
            <dt><LocalizedText en="Requested action" nb="Forespurt handling" ar="الإجراء المطلوب" /></dt>
            <dd>{approval.actionTitle || (approval.actionId ? <LocalizedText en="Action details unavailable" nb="Handlingsdetaljer er utilgjengelige" ar="تفاصيل الإجراء غير متاحة" /> : <LocalizedText en="Mission-level approval" nb="Oppdragsgodkjenning" ar="موافقة على مستوى المهمة" />)}</dd>
            <dt><LocalizedText en="Assigned agent" nb="Tildelt agent" ar="الوكيل المعيّن" /></dt>
            <dd>{approval.agentName || <LocalizedText en="No agent linked to this mission" nb="Ingen agent er knyttet til dette oppdraget" ar="لا يوجد وكيل مرتبط بهذه المهمة" />}</dd>
            <dt><LocalizedText en="Requested by" nb="Forespurt av" ar="طلبه" /></dt>
            <dd>{approval.requesterLabel || <LocalizedText en="Workspace member" nb="Medlem" ar="عضو مساحة العمل" />}</dd>
            <dt><LocalizedText en="Submitted" nb="Sendt inn" ar="تاريخ الإرسال" /></dt>
            <dd><time dateTime={approval.createdAt}>{new Date(approval.createdAt).toLocaleString()}</time></dd>
            <dt><LocalizedText en="Requested scope" nb="Forespurt omfang" ar="النطاق المطلوب" /></dt>
            <dd>{summariseApprovalScope(approval.requestedScope)}</dd>
            <dt><LocalizedText en="Agent authority" nb="Agentfullmakt" ar="صلاحيات الوكيل" /></dt>
            <dd>{approval.agentAuthority
              ? summariseApprovalScope(approval.agentAuthority)
              : <LocalizedText en="No agent authority snapshot is attached to this request." nb="Ingen oversikt over agentens fullmakter er vedlagt." ar="لا توجد نسخة مرفقة من صلاحيات الوكيل." />}</dd>
            <dt><LocalizedText en="Why approval is required" nb="Hvorfor godkjenning kreves" ar="لماذا تُطلب الموافقة" /></dt>
            <dd>{approval.actionId
              ? <LocalizedText en="This action is gated by workspace policy and must be explicitly approved before execution." nb="Denne handlingen styres av arbeidsområdepolicy og må godkjennes uttrykkelig før utførelse." ar="تخضع هذه العملية لسياسة مساحة العمل ويجب الموافقة عليها صراحة قبل التنفيذ." />
              : <LocalizedText en="This request needs a recorded human decision before any approval-gated action can proceed." nb="Forespørselen krever en registrert menneskelig beslutning før handlingen kan fortsette." ar="يتطلب هذا الطلب قرارًا بشريًا مسجّلًا قبل متابعة أي إجراء يحتاج إلى موافقة." />}</dd>
          </dl>
          <p className="action-hint">
            <LocalizedText en="Approving records permission for the bounded scope above. It does not execute the action by itself; the execution runtime must still enforce the approved scope and authority. Review the mission evidence before deciding. Rejected requests require a reason and remain non-executable." nb="Godkjenning registrerer tillatelse for det avgrensede omfanget ovenfor. Den utfører ikke handlingen i seg selv; kjøretiden må fortsatt håndheve omfang og fullmakt. Se gjennom dokumentasjonen før du bestemmer deg. Avslag krever en begrunnelse, og forespørselen forblir ikke-kjørbar." ar="تسجّل الموافقة الإذن بالنطاق المحدد أعلاه، لكنها لا تنفّذ الإجراء بحد ذاتها؛ يجب أن يفرض نظام التنفيذ النطاق والصلاحيات المعتمدة. راجع أدلة المهمة قبل القرار. يتطلب الرفض سببًا وتبقى الإجراءات المرفوضة غير قابلة للتنفيذ." />
          </p>
          <div className="approval-actions">
            <Link className="button button-small button-quiet" href={`/app/missions/${approval.missionId}`}><LocalizedText en="Open mission and evidence" nb="Åpne oppdrag og dokumentasjon" ar="افتح المهمة والأدلة" /></Link>
          </div>
          {canDecide
            ? <ApprovalDecisionControls approvalId={approval.id} />
            : <p className="detail-intent"><LocalizedText en="Only workspace owners and admins can approve or reject requests. You can still inspect the mission and its evidence." nb="Bare eiere og administratorer kan godkjenne eller avslå forespørsler. Du kan fortsatt se oppdraget og dokumentasjonen." ar="يمكن لمالكي مساحة العمل والمسؤولين فقط قبول الطلبات أو رفضها. يمكنك مع ذلك الاطلاع على المهمة وأدلتها." /></p>}
        </article>
      )) : (
        <div className="card empty-state">
          <h2><LocalizedText en="No approvals waiting" nb="Ingen godkjenninger venter" ar="لا توجد موافقات معلّقة" /></h2>
          <p><LocalizedText en="There are no pending requests in this workspace. Actions that require approval remain blocked until an explicit approval is recorded." nb="Ingen forespørsler venter i dette arbeidsområdet. Handlinger som krever godkjenning, forblir blokkert til godkjenning er registrert." ar="لا توجد طلبات معلّقة في مساحة العمل. تبقى الإجراءات التي تتطلب موافقة محظورة حتى تسجيل موافقة صريحة." /></p>
          <Link className="button button-small button-quiet" href="/app/business"><LocalizedText en="Back to business workspace" nb="Tilbake til arbeidsområdet" ar="العودة إلى مساحة العمل" /></Link>
        </div>
      )}
    </section>
  );
}

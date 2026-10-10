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
            <dt><LocalizedText en="Approval expiry" nb="Godkjenningen utløper" ar="انتهاء صلاحية الموافقة" es="Caducidad de la aprobación" fr="Expiration de l’approbation" de="Ablauf der Genehmigung" /></dt>
            <dd>{approval.expiresAt
              ? <time dateTime={approval.expiresAt}>{new Date(approval.expiresAt).toLocaleString()}</time>
              : <LocalizedText en="No fixed expiry; this approval still does not authorize a future execution unless its scope matches exactly." nb="Ingen fast utløpstid; denne godkjenningen gir likevel ikke tillatelse til fremtidig kjøring uten nøyaktig omfangstreff." ar="لا يوجد انتهاء محدد؛ ومع ذلك لا تسمح هذه الموافقة بتنفيذ مستقبلي ما لم يتطابق النطاق بدقة." es="Sin caducidad fija; esta aprobación tampoco autoriza una ejecución futura si el alcance no coincide exactamente." fr="Aucune expiration fixe ; cette approbation n’autorise pas non plus une exécution ultérieure si le périmètre ne correspond pas exactement." de="Kein festes Ablaufdatum; auch diese Genehmigung erlaubt keine spätere Ausführung, wenn der Umfang nicht exakt übereinstimmt." />}</dd>
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
            <LocalizedText en="Approval does not run an action by itself. Agent execution is allowed only when the database matches an unexpired approval to the exact agent, mission/action versions, request content, destination and audience. A generic mission/action approval cannot authorize a later payload or destination. Review the scope above before deciding." nb="Godkjenning utfører ikke handlingen i seg selv. Agentkjøring tillates bare når databasen kobler en ikke-utløpt godkjenning til nøyaktig agent, oppdrags-/handlingsversjoner, forespørselsinnhold, destinasjon og målgruppe. En generell oppdrags-/handlingsgodkjenning gir ikke tillatelse til senere innhold eller en annen destinasjon. Kontroller omfanget før du bestemmer deg." ar="الموافقة لا تنفّذ الإجراء بحد ذاتها. لا يُسمح بتنفيذ الوكيل إلا إذا طابقت قاعدة البيانات موافقة غير منتهية مع الوكيل وإصدارات المهمة/الإجراء ومحتوى الطلب والوجهة والجمهور المستهدف بدقة. الموافقة العامة على مهمة أو إجراء لا تسمح بمحتوى أو وجهة لاحقة مختلفة. راجع النطاق أعلاه قبل اتخاذ القرار." es="La aprobación no ejecuta la acción por sí sola. La ejecución del agente solo se permite si la base de datos vincula una aprobación vigente con el agente, las versiones de la misión/acción, el contenido exacto de la solicitud, el destino y la audiencia. Una aprobación genérica no autoriza contenido ni destinos posteriores diferentes. Revisa el alcance antes de decidir." fr="L’approbation n’exécute pas l’action à elle seule. L’exécution d’un agent n’est autorisée que si la base de données associe une approbation non expirée à l’agent, aux versions de la mission/de l’action, au contenu exact de la demande, à la destination et au public visé. Une approbation générique n’autorise pas un contenu ou une destination ultérieurs différents. Vérifiez le périmètre avant de décider." de="Die Genehmigung führt die Aktion nicht selbst aus. Eine Agentenausführung ist nur erlaubt, wenn die Datenbank eine nicht abgelaufene Genehmigung exakt an Agent, Missions-/Aktionsversionen, Anfrageinhalt, Ziel und Zielgruppe bindet. Eine allgemeine Missions-/Aktionsgenehmigung autorisiert keine später abweichenden Inhalte oder Ziele. Prüfen Sie den Umfang vor der Entscheidung." />
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

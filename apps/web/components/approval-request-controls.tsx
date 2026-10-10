"use client";

import { useState } from "react";
import { LocalizedText } from "./localized-text";

type RequestMessage = "" | "requested" | "failed";

export function ApprovalRequestControls({ missionId, actionId, executionBinding }: { missionId: string; actionId?: string; executionBinding?: { agentId: string; request: Record<string, unknown> } }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<RequestMessage>("");

  async function request() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/missions/${missionId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: actionId ?? null,
          scope: executionBinding
            ? { schema_version: 1, type: "agent_execution_binding_v1", agent_id: executionBinding.agentId, request: executionBinding.request }
            : { type: "bounded_action", requires_approval: true, action_id: actionId ?? null },
        }),
      });

      if (!response.ok) {
        setMessage("failed");
        return;
      }
      setMessage("requested");
    } catch {
      setMessage("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="approval-inline">
      <button className="button button-small button-quiet" type="button" onClick={request} disabled={busy}>
        {busy
          ? <LocalizedText en="Requesting…" nb="Ber om godkjenning…" ar="جارٍ طلب الموافقة…" />
          : <LocalizedText en="Request approval" nb="Be om godkjenning" ar="طلب الموافقة" />}
      </button>
      <small className="action-hint">
        {executionBinding
          ? <LocalizedText
              en="This approval is bound to one exact request summary, destination and audience. Changed input, authority or expiry will block execution."
              nb="Denne godkjenningen er knyttet til én bestemt forespørsel, destinasjon og målgruppe. Endret innhold, fullmakt eller utløp blokkerer kjøringen."
              ar="ترتبط هذه الموافقة بطلب ووجهة وجمهور محددين. سيُمنع التنفيذ إذا تغير المحتوى أو الصلاحيات أو انتهت الصلاحية."
              es="Esta aprobación está vinculada a una solicitud, destino y audiencia concretos. Los cambios de contenido, autoridad o caducidad bloquearán la ejecución."
              fr="Cette approbation est liée à une demande, une destination et un public précis. Tout changement de contenu, d’autorité ou d’expiration bloquera l’exécution."
              de="Diese Genehmigung ist an eine konkrete Anfrage, ein Ziel und eine Zielgruppe gebunden. Änderungen an Inhalt, Berechtigung oder Ablauf verhindern die Ausführung."
            />
          : <LocalizedText
              en="This is a review request only. It cannot authorize a future agent run or external effect because no exact execution request is attached."
              nb="Dette er bare en forespørsel om vurdering. Den kan ikke godkjenne fremtidig agentkjøring eller ekstern effekt uten en nøyaktig utførelsesforespørsel."
              ar="هذا طلب مراجعة فقط. لا يسمح بتنفيذ مستقبلي للوكيل أو بإحداث أثر خارجي لأنه لا يتضمن طلب تنفيذ محددًا."
              es="Esta es solo una solicitud de revisión. No autoriza una futura ejecución del agente ni un efecto externo porque no incluye una solicitud de ejecución exacta."
              fr="Il s’agit uniquement d’une demande d’examen. Elle n’autorise pas une future exécution de l’agent ni un effet externe sans requête d’exécution exacte."
              de="Dies ist nur eine Prüfungsanfrage. Ohne eine genaue Ausführungsanfrage autorisiert sie weder einen zukünftigen Agentenlauf noch eine externe Wirkung."
            />}
      </small>
      {message === "requested" && (
        <small className="action-hint" role="status">
          <LocalizedText en="Approval requested" nb="Godkjenning forespurt" ar="تم طلب الموافقة" />
        </small>
      )}
      {message === "failed" && (
        <small className="field-error" role="alert">
          <LocalizedText
            en="Approval could not be requested. Check your connection and try again."
            nb="Kunne ikke be om godkjenning. Kontroller tilkoblingen og prøv igjen."
            ar="تعذّر طلب الموافقة. تحقّق من الاتصال وحاول مرة أخرى."
          />
        </small>
      )}
    </span>
  );
}

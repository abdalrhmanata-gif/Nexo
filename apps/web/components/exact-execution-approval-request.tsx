"use client";

import { useState, type FormEvent } from "react";
import { LocalizedText } from "./localized-text";

type AgentOption = { id: string; name: string };
type ActionOption = { id: string; title: string };

export function ExactExecutionApprovalRequest({
  missionId,
  agents,
  actions,
}: {
  missionId: string;
  agents: AgentOption[];
  actions: ActionOption[];
}) {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [actionId, setActionId] = useState(actions[0]?.id ?? "");
  const [summary, setSummary] = useState("");
  const [destination, setDestination] = useState("");
  const [audience, setAudience] = useState("");
  const [payloadText, setPayloadText] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"requested" | "invalid" | "failed" | "">("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage("");

    const trimmedSummary = summary.trim();
    const trimmedDestination = destination.trim();
    const trimmedAudience = audience.trim();
    if (!agentId || !trimmedSummary || !trimmedDestination || !trimmedAudience
      || trimmedSummary.length > 500 || trimmedDestination.length > 500 || trimmedAudience.length > 300) {
      setMessage("invalid");
      return;
    }

    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(payloadText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setMessage("invalid");
        return;
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      setMessage("invalid");
      return;
    }

    // The database stores a hash of this exact request in the approval scope,
    // not the user-supplied payload itself. Future execution must send this
    // same request object or the database will reject it.
    const request = {
      destination: trimmedDestination,
      audience: trimmedAudience,
      summary: trimmedSummary,
      payload,
    };
    if (new TextEncoder().encode(JSON.stringify(request)).length > 16000) {
      setMessage("invalid");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/missions/${missionId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: actionId || null,
          scope: {
            schema_version: 1,
            type: "agent_execution_binding_v1",
            agent_id: agentId,
            request,
          },
        }),
      });
      if (!response.ok) {
        setMessage("failed");
        return;
      }
      setMessage("requested");
      setSummary("");
      setDestination("");
      setAudience("");
      setPayloadText("{}");
      setOpen(false);
    } catch {
      setMessage("failed");
    } finally {
      setBusy(false);
    }
  }

  if (!agents.length) {
    return <p className="action-hint"><LocalizedText en="No active agent currently requires approval." nb="Ingen aktive agenter krever godkjenning nå." ar="لا يوجد وكيل نشط يتطلب موافقة حاليًا." /></p>;
  }

  return (
    <div className="exact-approval-request">
      <button className="button button-small button-quiet" type="button" onClick={() => { setOpen((value) => !value); setMessage(""); }} aria-expanded={open}>
        <LocalizedText en="Request exact execution approval" nb="Be om nøyaktig godkjenning for kjøring" ar="طلب موافقة دقيقة على التنفيذ" />
      </button>
      <p className="action-hint">
        <LocalizedText
          en="This submits a review request only; nothing is executed. The approval will match this exact request, agent authority, mission/action versions, destination, audience and expiry."
          nb="Dette sender bare en forespørsel til vurdering; ingenting utføres. Godkjenningen bindes til nøyaktig forespørsel, agentfullmakt, oppdrags-/handlingsversjoner, mål, målgruppe og utløp."
          ar="هذا يرسل طلب مراجعة فقط ولا ينفّذ شيئًا. سترتبط الموافقة بالطلب الدقيق وصلاحيات الوكيل وإصدارات المهمة/الإجراء والوجهة والجمهور المستهدف وموعد الانتهاء."
        />
      </p>
      {open && (
        <form className="add-action exact-approval-form" onSubmit={submit}>
          <div className="action-control">
            <label htmlFor={`exact-approval-agent-${missionId}`}><LocalizedText en="Agent" nb="Agent" ar="الوكيل" /></label>
            <select id={`exact-approval-agent-${missionId}`} value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={busy} required>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
          <div className="action-control">
            <label htmlFor={`exact-approval-action-${missionId}`}><LocalizedText en="Action scope" nb="Handlingsomfang" ar="نطاق الإجراء" /></label>
            <select id={`exact-approval-action-${missionId}`} value={actionId} onChange={(event) => setActionId(event.target.value)} disabled={busy}>
              <option value=""><LocalizedText en="Mission-level" nb="Oppdragsnivå" ar="على مستوى المهمة" /></option>
              {actions.map((action) => <option key={action.id} value={action.id}>{action.title}</option>)}
            </select>
          </div>
          <div className="action-control">
            <label htmlFor={`exact-approval-summary-${missionId}`}><LocalizedText en="Request summary" nb="Sammendrag av forespørselen" ar="ملخص الطلب" /></label>
            <input id={`exact-approval-summary-${missionId}`} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} disabled={busy} required />
          </div>
          <div className="action-control">
            <label htmlFor={`exact-approval-destination-${missionId}`}><LocalizedText en="Destination" nb="Mål" ar="الوجهة" /></label>
            <input id={`exact-approval-destination-${missionId}`} value={destination} onChange={(event) => setDestination(event.target.value)} maxLength={500} disabled={busy} required />
          </div>
          <div className="action-control">
            <label htmlFor={`exact-approval-audience-${missionId}`}><LocalizedText en="Audience" nb="Målgruppe" ar="الجمهور المستهدف" /></label>
            <input id={`exact-approval-audience-${missionId}`} value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={300} disabled={busy} required />
          </div>
          <div className="action-control">
            <label htmlFor={`exact-approval-payload-${missionId}`}><LocalizedText en="Exact payload (JSON object)" nb="Nøyaktig innhold (JSON-objekt)" ar="الحمولة الدقيقة (كائن JSON)" /></label>
            <textarea id={`exact-approval-payload-${missionId}`} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={5} maxLength={12000} disabled={busy} required spellCheck={false} />
            <small className="action-hint"><LocalizedText en="Enter the exact object that the future execution request will contain. It is hashed for matching; this approval record does not store the payload." nb="Oppgi det nøyaktige objektet den fremtidige kjøringen skal inneholde. Det brukes til hashing og lagres ikke i selve godkjenningsposten." ar="أدخل الكائن الدقيق الذي سيحتويه طلب التنفيذ لاحقًا. تُحسب بصمته للمطابقة ولا تُخزّن الحمولة داخل سجل الموافقة." /></small>
          </div>
          {message === "invalid" && <p className="field-error" role="alert"><LocalizedText en="Check the summary and destination fields, and make sure the payload is a JSON object within the size limit." nb="Kontroller sammendrag og mål, og sørg for at innholdet er et JSON-objekt innenfor størrelsesgrensen." ar="تحقّق من الملخص والوجهة وتأكد أن الحمولة كائن JSON ضمن حد الحجم." /></p>}
          {message === "failed" && <p className="field-error" role="alert"><LocalizedText en="The approval request could not be created. An approval may already be pending or the agent policy may have changed. Refresh and review the workspace." nb="Kunne ikke opprette godkjenningsforespørselen. Det kan allerede finnes en ventende forespørsel, eller agentpolicyen kan ha endret seg. Oppdater siden og kontroller arbeidsområdet." ar="تعذّر إنشاء طلب الموافقة. قد يكون هناك طلب معلّق بالفعل أو ربما تغيرت سياسة الوكيل. حدّث الصفحة وراجع مساحة العمل." /></p>}
          <button className="button button-small" type="submit" disabled={busy}>
            {busy ? <LocalizedText en="Requesting…" nb="Ber om godkjenning…" ar="جارٍ طلب الموافقة…" /> : <LocalizedText en="Submit exact-scope request" nb="Send forespørsel med nøyaktig omfang" ar="إرسال طلب بالنطاق الدقيق" />}
          </button>
        </form>
      )}
      {message === "requested" && <p className="action-hint" role="status"><LocalizedText en="Exact-scope approval requested. Nothing was executed." nb="Godkjenning med nøyaktig omfang er forespurt. Ingenting ble utført." ar="تم طلب موافقة بالنطاق الدقيق. لم يتم تنفيذ أي شيء." /></p>}
    </div>
  );
}

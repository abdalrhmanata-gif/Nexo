"use client";

import { useState } from "react";
import { LocalizedText } from "./localized-text";

type RequestMessage = "" | "requested" | "failed";

export function ApprovalRequestControls({ missionId, actionId }: { missionId: string; actionId?: string }) {
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
          scope: { type: "bounded_action", requires_approval: true, action_id: actionId ?? null },
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

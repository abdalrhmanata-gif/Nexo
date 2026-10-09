"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApprovalDecisionControls({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function decide(decision: "APPROVED" | "REJECTED") {
    setError("");
    if (decision === "REJECTED" && !note.trim()) {
      setError("Add a short reason before rejecting this request.");
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/missions/approval/${approvalId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "The decision could not be recorded. Refresh and try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("The decision could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="approval-actions">
      <label className="field">
        <span>Decision note <span className="action-hint">(required to reject)</span></span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 4000))}
          maxLength={4000}
          rows={2}
          placeholder="Record the reason or any condition for this decision."
          disabled={busy}
        />
      </label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="approval-actions">
        <button className="button button-small" type="button" onClick={() => decide("APPROVED")} disabled={busy}>
          {busy ? "Saving…" : "Approve bounded scope"}
        </button>
        <button className="button button-small button-quiet" type="button" onClick={() => decide("REJECTED")} disabled={busy}>
          Reject request
        </button>
      </div>
    </div>
  );
}

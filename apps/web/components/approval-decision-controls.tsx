"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalizedText } from "./localized-text";

export function ApprovalDecisionControls({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<"en" | "nb" | "ar" | "es" | "fr" | "de">("en");

  useEffect(() => {
    const syncLanguage = () => {
      const value = document.documentElement.lang;
      setLanguage((["en", "nb", "ar", "es", "fr", "de"].includes(value) ? value : "en") as typeof language);
    };
    syncLanguage();
    window.addEventListener("zavqera-language-change", syncLanguage);
    return () => window.removeEventListener("zavqera-language-change", syncLanguage);
  }, []);

  const notePlaceholder: Record<typeof language, string> = {
    en: "Record the reason or any condition for this decision.",
    nb: "Registrer begrunnelsen eller eventuelle vilkår for beslutningen.",
    ar: "سجّل سبب القرار أو أي شروط مرتبطة به.",
    es: "Registra el motivo o las condiciones de esta decisión.",
    fr: "Consignez le motif ou toute condition de cette décision.",
    de: "Dokumentieren Sie den Grund oder Bedingungen für diese Entscheidung.",
  };

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
        <span><LocalizedText en="Decision note" nb="Beslutningsnotat" ar="ملاحظة القرار" /> <span className="action-hint">(<LocalizedText en="required to reject" nb="påkrevd ved avslag" ar="مطلوب عند الرفض" />)</span></span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 4000))}
          maxLength={4000}
          rows={2}
          placeholder={notePlaceholder[language]}
          disabled={busy}
        />
      </label>
      {error && <p role="alert" className="field-error"><LocalizedText en={error} /></p>}
      <div className="approval-actions">
        <button className="button button-small" type="button" onClick={() => decide("APPROVED")} disabled={busy}>
          {busy ? <LocalizedText en="Saving…" nb="Lagrer…" ar="جارٍ الحفظ…" /> : <LocalizedText en="Approve bounded scope" nb="Godkjenn avgrenset omfang" ar="وافق على النطاق المحدد" />}
        </button>
        <button className="button button-small button-quiet" type="button" onClick={() => decide("REJECTED")} disabled={busy}>
          <LocalizedText en="Reject request" nb="Avslå forespørselen" ar="ارفض الطلب" />
        </button>
      </div>
    </div>
  );
}

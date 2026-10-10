"use client";
import { useState } from "react";
import { LocalizedText } from "./localized-text";

export function InvitationRevokeButton({ invitationId }: { invitationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const revoke = async () => {
    const language = document.documentElement.lang;
    const confirmMessage = language === "ar" ? "هل تريد إلغاء هذه الدعوة؟ سيتوقف الرابط عن العمل." : language === "nb" ? "Vil du tilbakekalle invitasjonen? Lenken slutter å virke." : "Revoke this invitation? The link will stop working.";
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/business/invitations/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Could not revoke invitation.");
      return;
    }
    setMessage("Revoked");
    window.location.reload();
  };

  return <span>
    <button className="button button-small button-quiet" type="button" disabled={busy} onClick={revoke}>{busy ? <LocalizedText en="Revoking…" nb="Tilbakekaller…" ar="جارٍ الإلغاء…" /> : <LocalizedText en="Revoke" nb="Tilbakekall" ar="إلغاء الدعوة" />}</button>
    {message && <span className="action-hint"> <LocalizedText en={message} /></span>}
  </span>;
}

"use client";
import { useState } from "react";
import { LocalizedText } from "./localized-text";

type Language = "en" | "nb" | "ar" | "es" | "fr" | "de";

export function InvitationRevokeButton({ invitationId }: { invitationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function confirmationText() {
    const language = document.documentElement.lang as Language;
    const messages: Record<Language, string> = {
      en: "Revoke this invitation? The link will stop working.",
      nb: "Tilbakekalle invitasjonen? Lenken slutter å virke.",
      ar: "هل تريد إلغاء هذه الدعوة؟ سيتوقف الرابط عن العمل.",
      es: "¿Revocar esta invitación? El enlace dejará de funcionar.",
      fr: "Révoquer cette invitation ? Le lien cessera de fonctionner.",
      de: "Diese Einladung widerrufen? Der Link funktioniert danach nicht mehr.",
    };
    return messages[language] ?? messages.en;
  }

  async function revoke() {
    if (busy || !window.confirm(confirmationText())) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/business/invitations/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Could not revoke invitation.");
        return;
      }
      setMessage("Revoked");
      window.location.reload();
    } catch {
      setMessage("Could not revoke invitation. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <span>
    <button className="button button-small button-quiet" type="button" disabled={busy} onClick={revoke}>
      {busy ? <LocalizedText en="Revoking…" nb="Tilbakekaller…" ar="جارٍ الإلغاء…" /> : <LocalizedText en="Revoke" nb="Tilbakekall" ar="إلغاء الدعوة" />}
    </button>
    {message && <span className="action-hint" role="status"> <LocalizedText en={message} /></span>}
  </span>;
}

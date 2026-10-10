"use client";
import { useState } from "react";
import { LocalizedText } from "./localized-text";

type Role = "owner" | "admin" | "member" | "viewer";
type Language = "en" | "nb" | "ar" | "es" | "fr" | "de";

export function MemberManagementControls({ memberId, currentRole }: { memberId: string; currentRole: Role }) {
  const [role, setRole] = useState<Role>(currentRole);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function removeConfirmation() {
    const language = document.documentElement.lang as Language;
    const messages: Record<Language, string> = {
      en: "Remove this member from the workspace?",
      nb: "Fjerne dette medlemmet fra arbeidsområdet?",
      ar: "هل تريد إزالة هذا العضو من مساحة العمل؟",
      es: "¿Eliminar a este miembro del espacio de trabajo?",
      fr: "Retirer ce membre de l’espace de travail ?",
      de: "Dieses Mitglied aus dem Workspace entfernen?",
    };
    return messages[language] ?? messages.en;
  }

  async function changeRole(nextRole: Role) {
    if (busy || nextRole === role) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/business/members/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId, role: nextRole }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Could not change role.");
        return;
      }
      setRole(nextRole);
      setMessage("Role updated");
    } catch {
      setMessage("Could not change role. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !window.confirm(removeConfirmation())) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/business/members/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Could not remove member.");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("Could not remove member. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (currentRole === "owner") return <span className="status status-active"><LocalizedText en="Owner protected" nb="Eier beskyttet" ar="المالك محمي" /></span>;
  return <div className="member-controls">
    <select aria-label="Member role" value={role} disabled={busy} onChange={(event) => void changeRole(event.target.value as Role)}>
      <option value="admin"><LocalizedText en="Admin" nb="Administrator" ar="مسؤول" /></option>
      <option value="member"><LocalizedText en="Member" nb="Medlem" ar="عضو" /></option>
      <option value="viewer"><LocalizedText en="Viewer" nb="Leser" ar="قارئ" /></option>
    </select>
    <button className="button button-small button-quiet" type="button" disabled={busy} onClick={remove}><LocalizedText en="Remove" nb="Fjern" ar="إزالة" /></button>
    {message && <span className="action-hint" role="status"><LocalizedText en={message} /></span>}
  </div>;
}

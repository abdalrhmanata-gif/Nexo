"use client";
import { useState } from "react";
import Link from "next/link";
import { LocalizedText } from "../../../../components/localized-text";

export default function BusinessInvitePage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    setError("");
    try {
      const response = await fetch("/api/business/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "The invitation email could not be sent.");
        return;
      }
      setStatus("Invitation email sent. Your teammate can use the secure link in their inbox; it expires after 7 days.");
      setEmail("");
    } catch {
      setError("The invitation could not be sent. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="container business-dashboard">
    <p className="eyebrow"><LocalizedText en="Business workspace" nb="Arbeidsområde" ar="مساحة العمل" /></p>
    <h1><LocalizedText en="Invite a teammate" nb="Inviter en kollega" ar="ادعُ زميلًا إلى مساحة العمل" /></h1>
    <p className="detail-intent"><LocalizedText en="Send a secure invitation directly to their inbox. Choose the least-privilege role they need. Invitations expire after 7 days." nb="Send en sikker invitasjon direkte til innboksen deres. Velg rollen med minst nødvendige rettigheter. Invitasjoner utløper etter 7 dager." ar="أرسل دعوة آمنة مباشرة إلى بريده الإلكتروني. اختر أقل صلاحية يحتاجها. تنتهي الدعوة بعد 7 أيام." /></p>
    <form className="card form-grid" onSubmit={submit}>
      <div className="field">
        <label htmlFor="invite-email"><LocalizedText en="Email address" nb="E-postadresse" ar="البريد الإلكتروني" /></label>
        <input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="invite-role"><LocalizedText en="Workspace role" nb="Rolle i arbeidsområdet" ar="الدور في مساحة العمل" /></label>
        <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="member">Member / Medlem / عضو</option>
          <option value="viewer">Viewer / Lesetilgang / قارئ</option>
          <option value="admin">Admin / Administrator / مسؤول</option>
        </select>
        <small><LocalizedText en="Grant only the access needed. Admins can manage workspace access." nb="Gi bare nødvendig tilgang. Administratorer kan administrere tilgangen til arbeidsområdet." ar="امنح الصلاحيات الضرورية فقط. يستطيع المسؤولون إدارة الوصول إلى مساحة العمل." /></small>
      </div>
      <button className="button" type="submit" disabled={loading}>{loading ? <LocalizedText en="Sending invitation…" nb="Sender invitasjon…" ar="جارٍ إرسال الدعوة…" /> : <LocalizedText en="Send email invitation" nb="Send e-postinvitasjon" ar="أرسل الدعوة بالبريد" />}</button>
      {status && <div className="success-state" role="status">{status}</div>}
      {error && <div className="field-error" role="alert">{error}</div>}
    </form>
    <p className="action-hint"><Link href="/app/business"><LocalizedText en="Back to Business workspace" nb="Tilbake til arbeidsområdet" ar="العودة إلى مساحة العمل" /></Link></p>
  </div>;
}

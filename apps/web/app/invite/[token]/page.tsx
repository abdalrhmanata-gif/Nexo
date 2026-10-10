"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LocalizedText } from "../../../components/localized-text";

type Invitation = { email: string; role: "admin" | "member" | "viewer" | string; status: string; expiresAt: string };
type StatusKey = "" | "loading" | "invalid" | "not-found" | "unavailable" | "load-failed" | "accepting" | "sign-in-required" | "email-mismatch" | "expired" | "not-pending" | "already-member" | "accept-failed" | "accepted";

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [status, setStatus] = useState<StatusKey>("loading");

  useEffect(() => {
    let mounted = true;
    params.then(async ({ token: value }) => {
      if (!mounted) return;
      setToken(value);
      if (!value || value.length !== 64 || !/^[a-f0-9]+$/i.test(value)) {
        setStatus("invalid");
        return;
      }
      try {
        const response = await fetch(`/api/business/invitations/${encodeURIComponent(value)}`, { cache: "no-store" });
        if (!response.ok) {
          setStatus(response.status === 400 ? "invalid" : response.status === 404 ? "not-found" : response.status >= 500 ? "unavailable" : "load-failed");
          return;
        }
        const data = await response.json() as { invitation?: Invitation };
        if (!mounted) return;
        if (!data.invitation) {
          setStatus("not-found");
          return;
        }
        setInvitation(data.invitation);
        setStatus("");
      } catch {
        if (mounted) setStatus("unavailable");
      }
    }).catch(() => { if (mounted) setStatus("load-failed"); });
    return () => { mounted = false; };
  }, [params]);

  async function accept() {
    setStatus("accepting");
    try {
      const response = await fetch(`/api/business/invitations/${encodeURIComponent(token)}`, { method: "POST", cache: "no-store" });
      const data = await response.json().catch(() => ({})) as { error?: string; invitation?: Invitation };
      if (response.status === 401) {
        setStatus("sign-in-required");
        return;
      }
      if (!response.ok) {
        const message = data.error ?? "";
        setStatus(response.status === 403 || message.includes("email address") ? "email-mismatch"
          : message.includes("expired") ? "expired"
          : message.includes("no longer pending") ? "not-pending"
          : message.includes("already a member") ? "already-member"
          : response.status >= 500 ? "unavailable"
          : "accept-failed");
        return;
      }
      if (data.invitation) setInvitation(data.invitation);
      setStatus("accepted");
    } catch {
      setStatus("unavailable");
    }
  }

  return <div className="container invitation-page">
    <p className="eyebrow"><LocalizedText en="ZAVQERA invitation" nb="ZAVQERA-invitasjon" ar="دعوة ZAVQERA" /></p>
    <h1><LocalizedText en="Join a workspace" nb="Bli med i et arbeidsområde" ar="انضم إلى مساحة عمل" /></h1>
    {invitation ? <section className="card invitation-card">
      <p><LocalizedText en="You were invited to join as" nb="Du er invitert til å bli med som" ar="تمت دعوتك للانضمام بصفتك" /> <strong><LocalizedText en={invitation.role} /></strong> <LocalizedText en="using" nb="med e-postadressen" ar="باستخدام البريد الإلكتروني" /> <strong>{invitation.email}</strong>.</p>
      <p className="action-hint"><LocalizedText en="This invitation expires" nb="Invitasjonen utløper" ar="تنتهي صلاحية الدعوة" /> {new Date(invitation.expiresAt).toLocaleString()}.</p>
      {invitation.status === "PENDING" && status !== "accepted" && <button className="button" type="button" onClick={accept} disabled={status === "accepting"}>{status === "accepting" ? <LocalizedText en="Accepting invitation…" nb="Godtar invitasjonen…" ar="جارٍ قبول الدعوة…" /> : <LocalizedText en="Accept invitation" nb="Godta invitasjon" ar="قبول الدعوة" />}</button>}
      {invitation.status !== "PENDING" && <p className="status status-waiting"><LocalizedText en="Invitation status:" nb="Invitasjonsstatus:" ar="حالة الدعوة:" /> <LocalizedText en={invitation.status} /></p>}
      {status && <div className={status === "accepted" ? "success-state" : status === "accept-failed" || status === "unavailable" ? "field-error" : "form-note"} role="status">
        {status === "loading" && <LocalizedText en="Loading invitation…" nb="Laster invitasjonen…" ar="جارٍ تحميل الدعوة…" />}
        {status === "invalid" && <LocalizedText en="This invitation link is invalid. Ask the workspace owner to send a new invitation." nb="Invitasjonslenken er ugyldig. Be eieren av arbeidsområdet om å sende en ny invitasjon." ar="رابط الدعوة غير صالح. اطلب من مالك مساحة العمل إرسال دعوة جديدة." />}
        {status === "not-found" && <LocalizedText en="This invitation could not be found. It may have been revoked or removed." nb="Invitasjonen ble ikke funnet. Den kan ha blitt tilbakekalt eller fjernet." ar="لم يتم العثور على الدعوة. ربما أُلغيت أو حُذفت." />}
        {status === "unavailable" && <LocalizedText en="Invitations are temporarily unavailable. Please try again shortly." nb="Invitasjoner er midlertidig utilgjengelige. Prøv igjen om litt." ar="الدعوات غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل." />}
        {status === "load-failed" && <LocalizedText en="The invitation could not be loaded. Open the original email link again." nb="Invitasjonen kunne ikke lastes. Åpne den opprinnelige lenken i e-posten igjen." ar="تعذّر تحميل الدعوة. افتح الرابط الأصلي في البريد مرة أخرى." />}
        {status === "sign-in-required" && <LocalizedText en="Sign in with the email address that received this invitation, then return here to accept it." nb="Logg inn med e-postadressen som mottok invitasjonen, og kom tilbake hit for å godta den." ar="سجّل الدخول بالبريد الذي استقبل الدعوة، ثم عُد إلى هنا لقبولها." />}
        {status === "email-mismatch" && <LocalizedText en="You must sign in with the exact email address that received this invitation." nb="Du må logge inn med den samme e-postadressen som mottok invitasjonen." ar="يجب تسجيل الدخول بالبريد الإلكتروني نفسه الذي استقبل الدعوة." />}
        {status === "expired" && <LocalizedText en="This invitation has expired. Ask the workspace owner to send a new one." nb="Invitasjonen har utløpt. Be eieren av arbeidsområdet om å sende en ny." ar="انتهت صلاحية الدعوة. اطلب من مالك مساحة العمل إرسال دعوة جديدة." />}
        {status === "not-pending" && <LocalizedText en="This invitation is no longer pending. It may already have been accepted or revoked." nb="Invitasjonen venter ikke lenger. Den kan allerede være godtatt eller tilbakekalt." ar="لم تعد الدعوة معلّقة. ربما قُبلت أو أُلغيت بالفعل." />}
        {status === "already-member" && <LocalizedText en="You are already a member of this workspace." nb="Du er allerede medlem av dette arbeidsområdet." ar="أنت عضو بالفعل في مساحة العمل هذه." />}
        {status === "accept-failed" && <LocalizedText en="The invitation could not be accepted. Check the details and try again." nb="Invitasjonen kunne ikke godtas. Kontroller opplysningene og prøv igjen." ar="تعذّر قبول الدعوة. تحقّق من التفاصيل وحاول مرة أخرى." />}
        {status === "accepted" && <LocalizedText en="Invitation accepted. You now have access to the workspace." nb="Invitasjonen er godtatt. Du har nå tilgang til arbeidsområdet." ar="تم قبول الدعوة. أصبح لديك الآن وصول إلى مساحة العمل." />}
        {status === "accepting" && <LocalizedText en="Accepting invitation…" nb="Godtar invitasjonen…" ar="جارٍ قبول الدعوة…" />}
      </div>}
      {status === "sign-in-required" || status === "email-mismatch" ? <p><Link className="button button-small" href={`/auth/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}><LocalizedText en="Sign in with invited email" nb="Logg inn med invitert e-post" ar="سجّل الدخول بالبريد المدعو" /></Link></p> : null}
      {status === "accepted" ? <p><Link className="button" href="/app/business"><LocalizedText en="Open Business workspace" nb="Åpne arbeidsområdet" ar="افتح مساحة العمل" /></Link></p> : null}
    </section> : <section className="card"><p role="status">
      {status === "loading" && <LocalizedText en="Loading invitation…" nb="Laster invitasjonen…" ar="جارٍ تحميل الدعوة…" />}
      {status === "invalid" && <LocalizedText en="This invitation link is invalid." nb="Invitasjonslenken er ugyldig." ar="رابط الدعوة غير صالح." />}
      {status === "not-found" && <LocalizedText en="This invitation could not be found." nb="Invitasjonen ble ikke funnet." ar="لم يتم العثور على الدعوة." />}
      {(status === "unavailable" || status === "load-failed") && <LocalizedText en="The invitation could not be loaded. Please try again later." nb="Invitasjonen kunne ikke lastes. Prøv igjen senere." ar="تعذّر تحميل الدعوة. حاول مرة أخرى لاحقًا." />}
    </p></section>}
  </div>;
}

"use client";

import { FormEvent, useState } from "react";
import { LocalizedText, useTranslate } from "./localized-text";

// The pricing page advertised three plans and sold none of them. Someone who
// would have paid had nowhere to say so, and the thing this product most
// lacks is evidence that anyone wants it. This asks for one address and one
// click, with no payment provider, no price commitment and no account.
//
// The address is personal data given on consent, so the exact sentence the
// person agreed to is sent with it and stored beside it. A consent you cannot
// evidence is not a consent, and this wording will change over time.

const CONSENT = "I asked to be emailed once this plan is available. My address is used for that one message and nothing else.";

export function PlanInterest({ plan }: { plan: string }) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  if (done) {
    return <p className="pricing-cta pricing-interest-done" role="status">
      <LocalizedText en="Noted — you will hear from us once, when it is ready." />
    </p>;
  }

  if (!open) {
    return <button className="button button-quiet pricing-cta" type="button" onClick={() => setOpen(true)}>
      <LocalizedText en="Tell me when it is ready" />
    </button>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      const response = await fetch("/api/plan-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          plan,
          locale: document.documentElement.lang || "en",
          consent: CONSENT,
        }),
      });
      if (!response.ok) throw new Error("rejected");
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <form className="pricing-interest" onSubmit={submit}>
    <label className="visually-hidden" htmlFor={`interest-${plan}`}>
      {t("Email address")}
    </label>
    <input
      id={`interest-${plan}`}
      name="email"
      type="email"
      required
      maxLength={254}
      autoComplete="email"
      placeholder={t("you@example.com")}
    />
    <button className="button button-small" type="submit" disabled={busy}>
      {busy ? t("Sending…") : t("Notify me")}
    </button>
    <small><LocalizedText en="One email, when this plan opens. Nothing else, and no account needed. You can ask us to delete your address at any time." /></small>
    {failed && <p className="field-error" role="alert">
      <LocalizedText en="That did not save. Check your connection and try again." />
    </p>}
  </form>;
}

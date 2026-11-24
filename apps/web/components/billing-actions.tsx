"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalizedText } from "./localized-text";

const PLANS = [
  { id: "plus", label: "Plus", price: "$19", limit: 10 },
  { id: "pro", label: "Pro", price: "$49", limit: 30 },
  { id: "scale", label: "Scale", price: "$69", limit: 90 },
] as const;

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({})) as { url?: unknown; error?: unknown; manage?: unknown };
  return { ok: response.ok, data };
}

/**
 * Buttons for choosing a plan or opening the Stripe Customer Portal.
 *
 * After Checkout, Stripe sends the person back here before its webhook has
 * necessarily reached the database. The page does not treat that return as
 * proof of payment: it says the payment is being confirmed and reloads the
 * plan for up to 30 seconds until the webhook has landed.
 */
export function BillingActions({ hasSubscription, plan, checkout, soldThroughLink = false }: { hasSubscription: boolean; plan: string; checkout: "success" | "cancelled" | null; soldThroughLink?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [manage, setManage] = useState(hasSubscription);
  const waiting = checkout === "success" && plan === "free";
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 30_000) { clearInterval(timer); setTimedOut(true); return; }
      router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  async function go(url: string, body?: unknown) {
    setError("");
    setBusy(url + JSON.stringify(body ?? {}));
    const { ok, data } = await post(url, body);
    if (ok && typeof data.url === "string") { window.location.assign(data.url); return; }
    setBusy(null);
    if (data.manage === true) setManage(true);
    setError(typeof data.error === "string" ? data.error : "Something went wrong. Try again.");
  }

  return <section className="card billing-actions">
    {checkout === "success" && waiting && !timedOut && <div className="success-state" role="status"><LocalizedText en="Your payment is being confirmed. This page updates by itself." /></div>}
    {checkout === "success" && waiting && timedOut && <div className="success-state" role="status"><LocalizedText en="Stripe has not confirmed the payment yet. Reload this page in a minute; nothing is lost." /></div>}
    {checkout === "success" && !waiting && <div className="success-state" role="status"><LocalizedText en="Your plan is active." /></div>}
    {checkout === "cancelled" && <div className="success-state" role="status"><LocalizedText en="Checkout was cancelled. Nothing was charged." /></div>}
    {error && <div className="field-error" role="alert"><LocalizedText en={error} /></div>}

    {manage
      ? <div className="billing-manage">
        <p><LocalizedText en="Change your payment method, see invoices or cancel in the Stripe customer portal." /></p>
        <button className="button" type="button" disabled={busy !== null} onClick={() => go("/api/billing/portal")}><LocalizedText en="Manage billing" /></button>
      </div>
      : <div className="billing-plans">
        {soldThroughLink
          ? <>
            <p><LocalizedText en="Prices are in US dollars and include VAT or sales tax where it applies. In some countries, checkout shows and charges the amount in the local currency." /></p>
            <p><LocalizedText en="Payments are processed by Link, a Stripe company, and appear on your card statement as LINK.COM* ZAVQERA." /></p>
          </>
          : <p><LocalizedText en="Prices are in US dollars. In some countries, checkout shows and charges the amount in the local currency." /></p>}
        <div className="billing-plan-grid">
          {PLANS.map((option) => <div className="billing-plan" key={option.id}>
            <strong><LocalizedText en={option.label} /></strong>
            <span>{option.price} <LocalizedText en="per month" /></span>
            <small>{option.limit} <LocalizedText en="AI drafts per month" /></small>
            <button className="button button-small" type="button" disabled={busy !== null} onClick={() => go("/api/billing/checkout", { plan: option.id })}>
              <LocalizedText en="Choose" /><span className="visually-hidden"> {option.label}</span>
            </button>
          </div>)}
        </div>
      </div>}
  </section>;
}

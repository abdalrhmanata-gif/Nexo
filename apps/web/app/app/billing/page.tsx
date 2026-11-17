import Link from "next/link";
import { BillingActions } from "../../../components/billing-actions";
import { LocalizedDateTime, LocalizedFill, LocalizedText } from "../../../components/localized-text";
import { PLAN_LIMITS, managedPaymentsEnabled } from "../../../lib/billing-plans.mjs";
import { billingConfigured } from "../../../lib/stripe-client";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const PLAN_NAMES: Record<string, string> = { free: "Free", plus: "Plus", pro: "Pro", scale: "Scale" };
const STATUS_LABELS: Record<string, string> = {
  active: "Active subscription",
  trialing: "Trial",
  past_due: "Payment failed. Update your payment method to keep your plan.",
  unpaid: "Unpaid. Update your payment method to keep your plan.",
  canceled: "Subscription cancelled",
  incomplete: "Payment not completed",
  incomplete_expired: "Payment not completed",
  paused: "Paused",
};

type Overview = { plan: string; status: string | null; cancel_at_period_end: boolean; current_period_end: string | null; monthly_limit: number; generations_used: number };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  if (!isSupabaseConfigured()) {
    return <div className="container billing-page"><div className="empty-state"><h2><LocalizedText en="Billing" /></h2><p><LocalizedText en="Billing is not available in this local copy." /></p></div></div>;
  }
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("billing_overview");
  const overview = (result.data as Overview[] | null)?.[0]
    ?? { plan: "free", status: null, cancel_at_period_end: false, current_period_end: null, monthly_limit: PLAN_LIMITS.free, generations_used: 0 };
  const hasSubscription = ["active", "trialing", "past_due", "unpaid"].includes(overview.status ?? "");
  const configured = billingConfigured();

  return <div className="container billing-page">
    <section className="section-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Billing" /></p>
        <h1><LocalizedText en="Your plan" /></h1>
        <p><LocalizedText en="Plans are billed monthly through Stripe. You can cancel at any time, and your plan lasts until the end of the period you paid for." /></p>
      </div>
      <Link className="button button-quiet" href="/pricing"><LocalizedText en="Compare plans" /></Link>
    </section>

    <section className="card billing-summary" aria-labelledby="billing-plan-heading">
      <p className="eyebrow"><LocalizedText en="Current plan" /></p>
      <h2 id="billing-plan-heading"><LocalizedText en={PLAN_NAMES[overview.plan] ?? "Free"} /></h2>
      {overview.status && <p className={overview.status === "past_due" || overview.status === "unpaid" ? "field-error" : "billing-status"}><LocalizedText en={STATUS_LABELS[overview.status] ?? "Active subscription"} /></p>}
      {overview.current_period_end && hasSubscription && <p className="muted">
        <LocalizedText en={overview.cancel_at_period_end ? "Ends on" : "Renews on"} /> <LocalizedDateTime value={overview.current_period_end} />
      </p>}
      <p className="billing-usage">
        <LocalizedFill en="{used} of {limit} AI briefs or Mission plans used this month." values={{ used: overview.generations_used, limit: overview.monthly_limit }} />
      </p>
    </section>

    {configured
      ? <BillingActions hasSubscription={hasSubscription} plan={overview.plan} soldThroughLink={managedPaymentsEnabled(process.env)} checkout={checkout === "success" || checkout === "cancelled" ? checkout : null} />
      : <section className="card"><p><LocalizedText en="Paid plans are not open yet. Everyone is on Free for now." /></p></section>}
  </div>;
}

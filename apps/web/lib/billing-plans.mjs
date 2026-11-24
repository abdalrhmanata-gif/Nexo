// Billing: the pure part. Plans, limits, and what a Checkout Session asks
// Stripe for. The database decides who is on which plan; Stripe takes the
// money; this module only describes the request.

export const PAID_PLANS = Object.freeze(["plus", "pro", "scale"]);
/** Monthly AI drafts (AI Mission plans or opportunity briefs). Mirrors the database constraint. */
export const PLAN_LIMITS = Object.freeze({ free: 2, plus: 10, pro: 30, scale: 90 });
/** Tags our Checkout Sessions in the Stripe Dashboard. */
export const CHECKOUT_LABEL = "zavqera-subscriptions-qkvbmwhr";

/** "$1.63": a monthly price in dollars divided by its AI drafts, to the cent. */
export function pricePerDraft(monthly, drafts) {
  return `$${(monthly / drafts).toFixed(2)}`;
}

export function isPaidPlan(value) {
  return typeof value === "string" && PAID_PLANS.includes(value);
}

/** "test" or "live" for a Stripe secret or restricted key, null otherwise. */
export function stripeKeyMode(key) {
  const match = typeof key === "string" ? /^(?:rk|sk)_(test|live)_[A-Za-z0-9]+$/.exec(key) : null;
  return match ? match[1] : null;
}

/**
 * True when STRIPE_MANAGED_PAYMENTS is exactly "on": Checkout Sessions then
 * ask Stripe to act as merchant of record (Managed Payments), so Stripe
 * collects and remits sales tax, VAT and GST in the countries it covers.
 * Off by default; switching it on needs Managed Payments activated in the
 * Dashboard and an eligible tax code on every product.
 */
export function managedPaymentsEnabled(env) {
  return env?.STRIPE_MANAGED_PAYMENTS === "on";
}

/** "plans" opens AI to every signed-in person within their plan's limit. */
export function aiAccessMode(env) {
  return env?.ZAVQERA_AI_ACCESS === "plans" ? "plans" : "allowlist";
}

/**
 * The form body for POST /v1/checkout/sessions.
 *
 * No payment_method_types: Stripe offers what the Dashboard enables. No
 * automatic_tax: without Managed Payments there is no tax registration, and
 * with it Stripe handles tax itself. The user id goes in twice because
 * Stripe's events can arrive in any order: client_reference_id comes back on
 * the completed session, the metadata on the subscription.
 *
 * With managedPayments, Stripe is the merchant of record. Stripe rejects
 * adaptive_pricing (always on there) and custom_text on those sessions, so
 * both are left out; Link shows its own standard terms and applies the
 * cooling-off rules itself (checked in the Sandbox, 2026-11-17).
 */
export function checkoutSessionParams({ priceId, customerId, email, userId, origin, managedPayments = false }) {
  const fields = new URLSearchParams();
  fields.set("mode", "subscription");
  fields.set("line_items[0][price]", priceId);
  fields.set("line_items[0][quantity]", "1");
  if (customerId) fields.set("customer", customerId);
  else if (email) fields.set("customer_email", email);
  fields.set("client_reference_id", userId);
  fields.set("subscription_data[metadata][user_id]", userId);
  fields.set("success_url", `${origin}/app/billing?checkout=success`);
  fields.set("cancel_url", `${origin}/app/billing?checkout=cancelled`);
  if (managedPayments) fields.set("managed_payments[enabled]", "true");
  else fields.set("adaptive_pricing[enabled]", "true");
  fields.set("integration_identifier", CHECKOUT_LABEL);
  // Shown above the pay button: the request to start at once is what the
  // terms' withdrawal clause relies on. Not allowed with Managed Payments.
  if (!managedPayments) {
    fields.set("custom_text[submit][message]", `By subscribing you ask ZAVQERA to start the service immediately. Terms: ${origin}/terms`);
  }
  return fields;
}

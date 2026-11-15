// Billing: the pure part. Plans, limits, and what a Checkout Session asks
// Stripe for. The database decides who is on which plan; Stripe takes the
// money; this module only describes the request.

export const PAID_PLANS = Object.freeze(["plus", "pro", "scale"]);
/** Monthly AI briefs or Mission plans. Mirrors the database constraint. */
export const PLAN_LIMITS = Object.freeze({ free: 1, plus: 10, pro: 30, scale: 90 });
/** Tags our Checkout Sessions in the Stripe Dashboard. */
export const CHECKOUT_LABEL = "zavqera-subscriptions-qkvbmwhr";

export function isPaidPlan(value) {
  return typeof value === "string" && PAID_PLANS.includes(value);
}

/** "test" or "live" for a Stripe secret or restricted key, null otherwise. */
export function stripeKeyMode(key) {
  const match = typeof key === "string" ? /^(?:rk|sk)_(test|live)_[A-Za-z0-9]+$/.exec(key) : null;
  return match ? match[1] : null;
}

/** "plans" opens AI to every signed-in person within their plan's limit. */
export function aiAccessMode(env) {
  return env?.ZAVQERA_AI_ACCESS === "plans" ? "plans" : "allowlist";
}

/**
 * The form body for POST /v1/checkout/sessions.
 *
 * No payment_method_types: Stripe offers what the Dashboard enables. No
 * automatic_tax: there is no tax registration yet. The user id goes in twice
 * because Stripe's events can arrive in any order: client_reference_id
 * comes back on the completed session, the metadata on the subscription.
 */
export function checkoutSessionParams({ priceId, customerId, email, userId, origin }) {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  if (customerId) params.set("customer", customerId);
  else if (email) params.set("customer_email", email);
  params.set("client_reference_id", userId);
  params.set("subscription_data[metadata][user_id]", userId);
  params.set("success_url", `${origin}/app/billing?checkout=success`);
  params.set("cancel_url", `${origin}/app/billing?checkout=cancelled`);
  params.set("adaptive_pricing[enabled]", "true");
  params.set("integration_identifier", CHECKOUT_LABEL);
  return params;
}

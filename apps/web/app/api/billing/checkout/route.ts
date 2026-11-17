import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { isTrustedSameOriginRequest } from "../../../../lib/request-origin.mjs";
import { resolveRequestOrigin } from "../../../../lib/auth/redirect.mjs";
import { checkoutSessionParams, isPaidPlan, managedPaymentsEnabled } from "../../../../lib/billing-plans.mjs";
import { stripeErrorCode, stripeMode, stripeRequest } from "../../../../lib/stripe-client";

export const dynamic = "force-dynamic";

/**
 * Start a subscription. The browser names a plan and nothing else: the price
 * comes from billing_prices for this deployment's Stripe mode, the customer
 * from the person's own billing record. Paid access is granted later by the
 * webhook, never by this route or the success page.
 */
export async function POST(request: NextRequest) {
  if (!isTrustedSameOriginRequest(request)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  const mode = stripeMode();
  if (!mode) return NextResponse.json({ error: "Billing is not available yet." }, { status: 503 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to choose a plan." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!isPaidPlan(body.plan)) return NextResponse.json({ error: "Choose Plus, Pro or Scale." }, { status: 400 });

  const context = await supabase.rpc("billing_checkout_context", { p_plan: body.plan, p_livemode: mode === "live" });
  const row = (context.data as { price_id: string | null; customer_id: string | null; has_subscription: boolean }[] | null)?.[0];
  if (context.error || !row?.price_id) return NextResponse.json({ error: "Billing is not available yet." }, { status: 503 });
  if (row.has_subscription) {
    return NextResponse.json({ error: "You already have a plan. Change or cancel it under Manage billing.", manage: true }, { status: 409 });
  }

  const result = await stripeRequest("/checkout/sessions", checkoutSessionParams({
    priceId: row.price_id,
    customerId: row.customer_id,
    email: user.email,
    userId: user.id,
    origin: resolveRequestOrigin(request.headers, request.url),
    managedPayments: managedPaymentsEnabled(process.env),
  }));
  if (!result.ok || typeof result.data.url !== "string") {
    console.error(`billing: checkout session not created (${result.status} ${stripeErrorCode(result)})`);
    return NextResponse.json({ error: "Checkout could not be started. Try again." }, { status: 502 });
  }
  return NextResponse.json({ url: result.data.url });
}

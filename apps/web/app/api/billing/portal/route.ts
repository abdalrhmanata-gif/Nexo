import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { isTrustedSameOriginRequest } from "../../../../lib/request-origin.mjs";
import { resolveRequestOrigin } from "../../../../lib/auth/redirect.mjs";
import { stripeErrorCode, stripeMode, stripeRequest } from "../../../../lib/stripe-client";

export const dynamic = "force-dynamic";

/**
 * Open the Stripe Customer Portal for the signed-in person's own customer.
 * The customer id comes only from their billing record; the URL Stripe
 * returns is short-lived and goes straight back to the browser.
 */
export async function POST(request: NextRequest) {
  if (!isTrustedSameOriginRequest(request)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  const mode = stripeMode();
  if (!mode) return NextResponse.json({ error: "Billing is not available yet." }, { status: 503 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage billing." }, { status: 401 });

  const context = await supabase.rpc("billing_checkout_context", { p_plan: null, p_livemode: mode === "live" });
  const customerId = (context.data as { customer_id: string | null }[] | null)?.[0]?.customer_id;
  if (context.error || !customerId) return NextResponse.json({ error: "There is no billing account yet. Choose a plan first." }, { status: 404 });

  const params = new URLSearchParams({ customer: customerId, return_url: `${resolveRequestOrigin(request.headers, request.url)}/app/billing` });
  const result = await stripeRequest("/billing_portal/sessions", params);
  if (!result.ok || typeof result.data.url !== "string") {
    console.error(`billing: portal session not created (${result.status} ${stripeErrorCode(result)})`);
    return NextResponse.json({ error: "Billing could not be opened. Try again." }, { status: 502 });
  }
  return NextResponse.json({ url: result.data.url });
}

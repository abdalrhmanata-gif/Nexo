import { stripeKeyMode } from "./billing-plans.mjs";

// A minimal server-only Stripe client: two endpoints, form-encoded, with the
// API version pinned so a Dashboard default change cannot alter responses.
// The official SDK would do the same; it is not used because this project's
// build environment could not install it when billing was written.
//
// STRIPE_SECRET_KEY is a restricted key set in Netlify. It is read here and
// nowhere else, and never logged or returned.

const STRIPE_API = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2026-10-28.endive";

export function stripeMode(): "test" | "live" | null {
  return stripeKeyMode(process.env.STRIPE_SECRET_KEY);
}

export function billingConfigured(): boolean {
  return stripeMode() !== null;
}

export type StripeResult = { ok: boolean; status: number; data: Record<string, unknown> };

export async function stripeRequest(path: "/checkout/sessions" | "/billing_portal/sessions", params: URLSearchParams): Promise<StripeResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !stripeKeyMode(key)) return { ok: false, status: 503, data: {} };
  try {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
      },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 504, data: {} };
  }
}

/** Stripe's error code, for a log line. Never the message, which can echo input. */
export function stripeErrorCode(result: StripeResult): string {
  const error = result.data.error as { code?: unknown; type?: unknown } | undefined;
  return String(error?.code ?? error?.type ?? "");
}

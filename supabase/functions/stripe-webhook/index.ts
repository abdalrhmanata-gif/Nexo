// Stripe webhook receiver for ZAVQERA billing.
//
// It verifies Stripe's signature, then hands the event to the database,
// where apply_stripe_event records it once and updates the person's plan.
// The service-role key stays inside Supabase: the runtime provides it, and
// the function is the only caller of apply_stripe_event.
//
// Configuration: STRIPE_WEBHOOK_SECRET (Edge Function secret, copied from the
// Stripe endpoint by the owner). Deployed with verify_jwt off, because Stripe
// sends a signature, not a Supabase JWT.
//
// Logs carry the event id, type and outcome only: never a payload, a
// customer detail or a secret.

import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyStripeSignature } from "./signature.mjs";

const MAX_BODY_BYTES = 512 * 1024;

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply(405, { error: "method not allowed" });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceKey) {
    console.error("stripe-webhook: not configured");
    return reply(503, { error: "not configured" });
  }

  const payload = await request.text();
  if (payload.length > MAX_BODY_BYTES) return reply(413, { error: "too large" });

  const check = await verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret);
  if (!check.ok) {
    console.warn(`stripe-webhook: refused, signature ${check.reason}`);
    return reply(400, { error: "invalid signature" });
  }

  let event: { id?: string; type?: string };
  try {
    event = JSON.parse(payload);
  } catch {
    return reply(400, { error: "invalid payload" });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("apply_stripe_event", { p_event: event });
  if (error) {
    console.error(`stripe-webhook: ${event.id} ${event.type} database error ${error.code ?? ""}`);
    return reply(500, { error: "not applied" });
  }
  console.log(`stripe-webhook: ${event.id} ${event.type} ${data}`);
  // "failed" was recorded with its reason; answering 500 makes Stripe retry.
  return data === "failed" ? reply(500, { error: "not applied" }) : reply(200, { received: true, result: data });
});

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyStripeSignature } from "../../../supabase/functions/stripe-webhook/signature.mjs";

// Stripe signs `${timestamp}.${raw body}` with HMAC-SHA256 and the endpoint's
// signing secret, and sends `t=<timestamp>,v1=<hex>` in Stripe-Signature.
// The secret below is made up for the test; it is not a Stripe value.
const secret = "whsec_test_only_not_a_real_secret";
const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
const now = 1_800_000_000;
const sign = (body, t = now, key = secret) => createHmac("sha256", key).update(`${t}.${body}`).digest("hex");

test("a genuine signature is accepted", async () => {
  assert.deepEqual(await verifyStripeSignature(payload, `t=${now},v1=${sign(payload)}`, secret, now), { ok: true });
});

test("one right signature among several is enough, as when Stripe rolls a secret", async () => {
  const header = `t=${now},v1=${"0".repeat(64)},v1=${sign(payload)},v0=ignored`;
  assert.deepEqual(await verifyStripeSignature(payload, header, secret, now), { ok: true });
});

test("a changed body, a wrong secret, or a missing or broken header is refused", async () => {
  const header = `t=${now},v1=${sign(payload)}`;
  assert.deepEqual(await verifyStripeSignature(payload.replace("updated", "created"), header, secret, now), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyStripeSignature(payload, `t=${now},v1=${sign(payload, now, "whsec_other")}`, secret, now), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyStripeSignature(payload, null, secret, now), { ok: false, reason: "missing" });
  assert.deepEqual(await verifyStripeSignature(payload, header, "", now), { ok: false, reason: "missing" });
  assert.deepEqual(await verifyStripeSignature(payload, "v1=abc", secret, now), { ok: false, reason: "malformed" });
  assert.deepEqual(await verifyStripeSignature(payload, `t=soon,v1=${sign(payload)}`, secret, now), { ok: false, reason: "malformed" });
});

test("a signature older than five minutes is refused, so a captured request cannot be replayed later", async () => {
  const old = now - 301;
  assert.deepEqual(await verifyStripeSignature(payload, `t=${old},v1=${sign(payload, old)}`, secret, now), { ok: false, reason: "stale" });
  const recent = now - 299;
  assert.deepEqual(await verifyStripeSignature(payload, `t=${recent},v1=${sign(payload, recent)}`, secret, now), { ok: true });
});

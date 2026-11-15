// Verifies Stripe's webhook signature with WebCrypto, so the same code runs
// in the Edge Function (Deno) and in the Node tests.
//
// Stripe sends `Stripe-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]`
// where each v1 is HMAC-SHA256 of `${t}.${raw body}` keyed with the
// endpoint's signing secret. Several v1 values appear while a secret is
// being rolled; one match is enough.

const encoder = new TextEncoder();

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compares without stopping at the first difference. */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export async function verifyStripeSignature(payload, header, secret, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  if (!header || !secret) return { ok: false, reason: "missing" };
  let timestamp = null;
  const signatures = [];
  for (const part of String(header).split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value.toLowerCase());
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return { ok: false, reason: "stale" };

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`))));
  return signatures.some((signature) => constantTimeEqual(signature, expected))
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}

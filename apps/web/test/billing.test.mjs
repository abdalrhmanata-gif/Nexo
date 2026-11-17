import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CHECKOUT_LABEL,
  PAID_PLANS,
  PLAN_LIMITS,
  aiAccessMode,
  checkoutSessionParams,
  isPaidPlan,
  stripeKeyMode,
} from "../lib/billing-plans.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the plans and their monthly AI limits are the approved ones", () => {
  assert.deepEqual(PAID_PLANS, ["plus", "pro", "scale"]);
  assert.deepEqual(PLAN_LIMITS, { free: 1, plus: 10, pro: 30, scale: 90 });
  for (const plan of PAID_PLANS) assert.equal(isPaidPlan(plan), true);
  for (const value of ["free", "PLUS", "price_123", "", null, undefined, 3, { plan: "pro" }]) assert.equal(isPaidPlan(value), false, String(value));
});

test("only a Stripe secret or restricted key says which mode billing runs in", () => {
  assert.equal(stripeKeyMode("rk_test_abc123"), "test");
  assert.equal(stripeKeyMode("sk_test_abc123"), "test");
  assert.equal(stripeKeyMode("rk_live_abc123"), "live");
  for (const value of [undefined, "", "pk_test_abc", "whsec_abc", "rk_test_", " rk_test_abc"]) assert.equal(stripeKeyMode(value), null, String(value));
});

test("a checkout session is a monthly subscription tied to the signed-in person, with Adaptive Pricing", () => {
  const params = checkoutSessionParams({ priceId: "price_abc", customerId: null, email: "a@example.com", userId: "u-1", origin: "https://zavqera.com" });
  assert.equal(params.get("mode"), "subscription");
  assert.equal(params.get("line_items[0][price]"), "price_abc");
  assert.equal(params.get("line_items[0][quantity]"), "1");
  assert.equal(params.get("customer_email"), "a@example.com");
  assert.equal(params.get("customer"), null);
  assert.equal(params.get("client_reference_id"), "u-1");
  assert.equal(params.get("subscription_data[metadata][user_id]"), "u-1");
  assert.equal(params.get("adaptive_pricing[enabled]"), "true");
  assert.equal(params.get("integration_identifier"), CHECKOUT_LABEL);
  assert.match(CHECKOUT_LABEL, /^zavqera-subscriptions-[a-z]{8}$/);
  assert.equal(params.get("success_url"), "https://zavqera.com/app/billing?checkout=success");
  assert.equal(params.get("cancel_url"), "https://zavqera.com/app/billing?checkout=cancelled");
  for (const key of params.keys()) {
    assert.doesNotMatch(key, /payment_method_types|automatic_tax/, "Stripe chooses payment methods; tax stays off until registration");
  }
});

test("a returning customer pays as the same Stripe customer", () => {
  const params = checkoutSessionParams({ priceId: "price_abc", customerId: "cus_123", email: "a@example.com", userId: "u-1", origin: "https://zavqera.com" });
  assert.equal(params.get("customer"), "cus_123");
  assert.equal(params.get("customer_email"), null);
});

test("AI opens by plan only when the deployment says so", () => {
  assert.equal(aiAccessMode({}), "allowlist");
  assert.equal(aiAccessMode({ ZAVQERA_AI_ACCESS: "PLANS" }), "allowlist");
  assert.equal(aiAccessMode({ ZAVQERA_AI_ACCESS: "plans" }), "plans");
});

test("the billing routes take the price and the customer from the database, never from the browser", () => {
  for (const route of ["app/api/billing/checkout/route.ts", "app/api/billing/portal/route.ts"]) {
    const body = read(route);
    assert.match(body, /isTrustedSameOriginRequest\(request\)/, route);
    assert.match(body, /rpc\("billing_checkout_context"/, route);
    assert.doesNotMatch(body, /body\.(priceId|price|customer|customerId|userId)\b/, route);
  }
  const checkout = read("app/api/billing/checkout/route.ts");
  assert.match(checkout, /isPaidPlan\(body\.plan\)/);
  assert.match(checkout, /has_subscription/, "a second subscription goes to the Portal instead");
  const client = read("lib/stripe-client.ts");
  assert.match(client, /"Stripe-Version": STRIPE_API_VERSION/);
  assert.match(client, /STRIPE_API_VERSION = "2026-10-28\.endive"/);
  assert.doesNotMatch(client, /console\.[a-z]+\([^)]*(key|STRIPE_SECRET_KEY)/i, "the key is never logged");
});

test("the AI routes ask the plan-aware gate, and a non-tester never learns the provider setup", () => {
  for (const route of ["app/api/missions/plan/route.ts", "app/api/opportunities/analyze/route.ts"]) {
    const body = read(route);
    assert.doesNotMatch(body, /isApprovedPreviewTester\(/, route);
    assert.match(body, /hasAiAccess\(user\.id\)/, route);
    assert.match(body, /visibleProviderRefusal\(user\.id, PROVIDER_REFUSAL\[provider\.reason\]\)/, route);
  }
});

test("every sentence billing can show is translated, including the routes' refusals", async () => {
  const { readDictionaries, LANGUAGES } = await import("./helpers/dictionaries.mjs");
  const gate = read("lib/ai/gate.ts");
  const sentences = new Set([/PROVIDER_UNAVAILABLE = "([^"]+)"/.exec(gate)[1]]);
  for (const route of ["app/api/billing/checkout/route.ts", "app/api/billing/portal/route.ts"]) {
    for (const match of read(route).matchAll(/error:\s*"((?:[^"\\]|\\.)*)"/g)) sentences.add(match[1]);
  }
  for (const match of read("app/app/billing/page.tsx").matchAll(/^\s+[a-z_]+: "([^"]+)",$/gm)) sentences.add(match[1]);
  assert.ok(sentences.size >= 17, `expected the billing sentences, found ${sentences.size}`);
  const tables = readDictionaries();
  const missing = [];
  for (const sentence of sentences) {
    const absent = LANGUAGES.filter((name) => !tables[name].has(sentence));
    if (absent.length) missing.push(`"${sentence}" is missing from ${absent.join(", ")}`);
  }
  assert.deepEqual(missing, []);
});

test("the pricing page says what is true when AI is open by plan but paid plans cannot be bought yet", () => {
  const pricing = read("app/pricing/page.tsx");
  assert.match(pricing, /aiAccessMode\(process\.env\) === "plans"/);
  assert.match(pricing, /Free is open now, with 1 AI brief or Mission plan a month\. The paid plans show proposed prices and cannot be bought yet\./);
  // The sentence about an approved preview tester stays only for the allowlist.
  assert.match(pricing, /aiOpen\s*\?[\s\S]*Free is open now[\s\S]*:[\s\S]*Proposed launch pricing, not active offers/);
});

test("the payment page says that subscribing starts the service at once", () => {
  const fields = checkoutSessionParams({ priceId: "price_x", email: "a@b.c", userId: "u1", origin: "https://zavqera.com" });
  const message = fields.get("custom_text[submit][message]");
  assert.ok(message && /start(s)? (the service )?immediately|starts at once/i.test(message), "the request to start at once is shown before paying");
  assert.ok(message.includes("https://zavqera.com/terms"), "the terms are linked from the payment page");
  assert.ok(message.length <= 1200, "Stripe accepts at most 1200 characters");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The billing migration is checked as text, like the other database tests:
// the rules that matter are the ones a reviewer would read in it.
const migration = readFileSync(new URL("../../../supabase/migrations/20261115220000_stripe_billing.sql", import.meta.url), "utf8");

test("the monthly AI limits are the approved ones, for every plan", () => {
  const limits = /\(plan = 'free' and monthly_limit = 1\)\s+or \(plan = 'plus' and monthly_limit = 10\)\s+or \(plan = 'pro' and monthly_limit = 30\)\s+or \(plan = 'scale' and monthly_limit = 90\)/g;
  assert.equal((migration.match(limits) ?? []).length, 2, "both ai_entitlements and ai_usage_monthly");
  assert.match(migration, /v_limit := coalesce\(v_limit, 1\);/, "a person with no entitlement row is on Free");
  assert.doesNotMatch(migration, /coalesce\(v_limit, 5\)/);
});

test("billing state lives outside the API, and only the service role can change it", () => {
  for (const table of ["billing_prices", "billing_customers", "billing_subscriptions", "billing_events"]) {
    assert.match(migration, new RegExp(`create table if not exists private\\.${table} \\(`), table);
  }
  assert.match(migration, /grant execute on function public\.apply_stripe_event\(jsonb\) to service_role;/);
  assert.match(migration, /revoke all on function public\.apply_stripe_event\(jsonb\) from public, anon, authenticated;/);
  assert.doesNotMatch(migration, /grant execute on function public\.apply_stripe_event\(jsonb\) to (anon|authenticated)/);
});

test("an event is applied once, and an older one never overwrites a newer state", () => {
  assert.match(migration, /on conflict \(event_id\) do update[\s\S]*where private\.billing_events\.status = 'failed'/);
  assert.match(migration, /where private\.billing_subscriptions\.last_event_created <= excluded\.last_event_created/);
});

test("only an active or trialing subscription with a known price grants a paid plan", () => {
  assert.match(migration, /status in \('active', 'trialing'\)/);
  assert.match(migration, /from private\.billing_prices p where p\.price_id = v_price_id/);
});

test("a cancellation from the Customer Portal keeps the plan until the end it names", () => {
  // On this API version the Portal sets cancel_at and leaves
  // cancel_at_period_end false (measured in the Sandbox, 2026-11-16).
  assert.match(migration, /or nullif\(v_object->>'cancel_at', ''\) is not null/);
  assert.match(migration, /when nullif\(v_object->>'cancel_at', ''\) is not null then to_timestamp\(\(v_object->>'cancel_at'\)::bigint\)/);
});

test("two events linking the same customer at once do not fail each other", () => {
  // checkout.session.completed and customer.subscription.created arrive
  // together; the second one used to fail and wait for Stripe's retry.
  assert.match(migration, /insert into private\.billing_customers \(user_id, customer_id, livemode\)\s+values \(p_user_id, p_customer_id, p_livemode\)\s+on conflict do nothing;/);
});

test("Free has 2 AI generations a month from the allowance migration on", () => {
  const two = readFileSync(new URL("../../../supabase/migrations/20261117160000_free_allowance_two.sql", import.meta.url), "utf8");
  const limits = /\(plan = 'free' and monthly_limit = 2\)\s+or \(plan = 'plus' and monthly_limit = 10\)\s+or \(plan = 'pro' and monthly_limit = 30\)\s+or \(plan = 'scale' and monthly_limit = 90\)/g;
  assert.equal((two.match(limits) ?? []).length, 2, "both ai_entitlements and ai_usage_monthly");
  assert.match(two, /v_limit := coalesce\(v_limit, 2\);/, "a person with no entitlement row gets 2");
  assert.match(two, /when 'plus' then 10 else 2 end/, "a cancelled plan falls back to 2");
  assert.match(two, /coalesce\(e\.monthly_limit, 2\)/, "the billing page shows 2 for a person with no row");
  assert.doesNotMatch(two, /monthly_limit = 1\)/, "no constraint still allows 1");
});

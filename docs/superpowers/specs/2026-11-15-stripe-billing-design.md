# Stripe billing and plan-based AI access: design (2026-11-15)

Source: the owner's handover "ZAVQERA — Stripe Sandbox Setup & Implementation
Handover", 2026-11-15. This document turns it into a buildable design.

## Intent

Let people pay for Plus, Pro or Scale through Stripe and get the monthly AI
allowance their plan promises, without anyone keeping a list by hand. Today
every customer except the two owner accounts is refused AI with "limited to
approved preview testers"; billing is the way to open it.

## Goals

- **Plans and monthly AI limits**, enforced by the existing quota:

  | Plan  | Price         | Monthly AI limit |
  |-------|---------------|------------------|
  | Free  | free          | 1                |
  | Plus  | $19 per month | 10               |
  | Pro   | $49 per month | 30               |
  | Scale | $69 per month | 90               |

- **Checkout.** A signed-in person subscribes through Stripe's hosted Checkout page. Adaptive Pricing shows NOK, EUR and other local currencies.
- **Customer Portal.** Opened from ZAVQERA for the person's own customer only. It is used to update the payment method, see and download invoices, and cancel at the end of the period.
- **Webhooks keep access in step with Stripe.** Every subscription change reaches the database through a verified webhook. Access follows Stripe's subscription state, never the success redirect.

## Non-goals

- Usage-based billing, Billing Meters or Metronome.
- Annual plans, trials and coupons.
- Plan changes in the Portal. They stay disabled until synchronisation is proven; enabling them later is a Portal setting, not code.
- Stripe Tax. Automatic tax stays off and no VAT rates are added (handover §6).
- Live mode.

## Anti-goals (failure even if it "works")

- Paid access granted from a redirect, from a browser-supplied price or customer id, or from a replayed or forged event.
- A failed renewal that keeps paid access.
- A Sandbox secret in a Production context, or any key in Git, logs or chat.
- Production entitlements or the AI allowlist changed without the owner's review.

## Environments (verified 2026-11-15)

- **Stripe.** Sandbox "Zavqera sandbox", `acct_1UbRP8FaJbl1m9U5`, country Norway. The only API key is the default full-access secret key; no restricted key exists yet. No webhook endpoint exists.
- **Products and prices**, read from the Dashboard:

  | Plan  | Product               | Price                            |
  |-------|-----------------------|----------------------------------|
  | Plus  | `prod_VdRH9bBPa7eZ6Y` | `price_1UcAOzFaJbl1m9U54ExSYv2C` |
  | Pro   | `prod_VdRLjmDXbQ6EUL` | `price_1UcASzFaJbl1m9U5SpEoDIJw` |
  | Scale | `prod_VdROrht9WLboOy` | `price_1UcAVFFaJbl1m9U5PwWAfu0v` |

  Each price is a USD amount per month.
- **Netlify Deploy Previews use the Supabase Development project** (`mrwmmbytcymqgwvcoywd`). This was measured: a preview request reached Development's REST API. Production (`mberkzpgypgeychmjtfx`) serves zavqera.com.
- **Test environment.** The whole Sandbox flow runs as Stripe Sandbox → Netlify Deploy Preview → Supabase Development. Production gets the code switched off, and the live Stripe objects come later, after review.
- **Existing quota.** `ai_entitlements` (plan, monthly_limit) feeds `private.reserve_ai_generation`. Its constraints allow free 5, plus 50 and pro 300, with no scale, and a missing row defaults to free/5. `ai_usage_monthly` copies plan and limit when the month starts. Production holds 0 entitlement rows and 2 usage rows (free/5, the owner accounts).

## Approaches considered

1. **Webhook in a Supabase Edge Function** (chosen). The handover's suggestion.
   - The service-role key never leaves Supabase, because the function gets it from its own runtime.
   - The function needs only the webhook signing secret and no Stripe API key, because every state it applies comes from the signed event itself.
2. **Webhook as a Netlify route.** Rejected: it would put the Supabase service-role key into Netlify (handover §D), or need a second trusted path into the database.
3. **Payment Links with no code.** Rejected: nothing reliable ties a payment to a Supabase user.

## Design

### Database (one migration; applied to Development first)

- **Plan limits.** Replace the limit checks on `ai_entitlements` and `ai_usage_monthly` with free 1, plus 10, pro 30 and scale 90. The default for a missing row becomes free/1.
- **New tables** in `private`, not exposed to the API:
  - `billing_prices`: `price_id` pk, `plan`, `environment`. Seeded per project with that project's Stripe price ids. The id-to-plan mapping is data, not code, so live ids are added in Production later without a deploy.
  - `billing_customers`: `user_id` pk referencing auth.users with on delete cascade, and `customer_id` unique.
  - `billing_subscriptions`: `subscription_id` pk, `user_id`, `customer_id`, `price_id`, `plan`, `status`, `cancel_at_period_end`, `current_period_end` and `last_event_created`.
  - `billing_events`: `event_id` pk, `type`, `created`, `received_at`, `status` (processed / ignored / failed), and `detail`.
- **`private.apply_stripe_event(event jsonb)`.** Callable only by `service_role`. Inside one transaction it:
  - **Idempotency.** Inserts the event id into `billing_events`. A repeat returns "duplicate" and changes nothing.
  - **`checkout.session.completed`.** Links `customer` to `client_reference_id`. Our server set that user id when it created the session, so the browser never supplies it. If the customer is already linked to another user, it fails loudly instead of re-linking.
  - **`customer.subscription.created/updated/deleted`.** Resolves the user through `billing_customers`. If the link is not there yet because events arrived out of order, it uses `subscription.metadata.user_id` as an explicit fallback. Our server also set that value at session creation.
  - **Out-of-order events.** An older event never overwrites a newer state: the update applies only when the event's `created` is at least the stored `last_event_created`.
  - **Entitlement.** Derived from that state: `active` or `trialing` with a known price gives that plan; anything else (`past_due`, `unpaid`, `canceled`, `incomplete`, an unknown price) gives free. Cancel-at-period-end keeps `active` until Stripe ends the period, so access lasts until then. The function then writes `ai_entitlements` and updates the current month's `ai_usage_monthly` row, so an upgrade or downgrade takes effect within the month. Usage already counted stays counted.
  - **`invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `radar.early_fraud_warning.created`.** Recorded with the related customer or subscription for review. Access is not changed from these, because the subscription events carry the state that matters. A dispute is marked so the owner sees it.
- **`public.billing_overview()`.** For the signed-in user: plan, status, renewal or end date, this month's usage and limit. Read-only.
- **`public.billing_checkout_context(p_plan text)`.** For the signed-in user: the price id for that plan from `billing_prices`, the linked customer id (if any), and whether an active subscription exists. This is how the Netlify routes read trusted data without the service-role key. Read-only. (Builder's call.)

### Edge Function `stripe-webhook` (Development first)

- Deno, with `verify_jwt` off because Stripe sends no JWT.
- Verifies `Stripe-Signature` with HMAC-SHA256 over `timestamp.payload` using WebCrypto. The tolerance is 5 minutes and the comparison is constant-time.
- Rejects with 400 on a bad signature. Calls `apply_stripe_event` with the service role, returns 200 on processed or duplicate and 500 on failure, so Stripe retries.
- Logs the event id and type only, never payloads or secrets.
- The verification is a pure ESM module, unit-tested in Node with the same code the function ships.

### Netlify routes (Next.js)

All routes require a same-origin request and a signed-in user.

- **`POST /api/billing/checkout`**, body `{ plan }`.
  - The plan is checked against Plus, Pro and Scale, and the price id is read from `billing_prices` on the server.
  - If the person already has an active subscription, the route answers "manage your plan" instead of creating a second one.
  - It creates a Checkout Session with:
    - `mode: subscription`;
    - `customer` if one is linked, otherwise `customer_email`;
    - `client_reference_id` and `subscription_data.metadata.user_id`;
    - Adaptive Pricing on;
    - an `integration_identifier` label;
    - success and cancel URLs on the request's own origin.
  - It sets no `payment_method_types` and no automatic tax.
- **`POST /api/billing/portal`.** The customer id comes only from `billing_customers` for the signed-in user. The route returns the short-lived portal URL.
- **Stripe client.** A small server-only client calls Stripe's REST API with `fetch`, using `STRIPE_SECRET_KEY` (a restricted key from Netlify) and a pinned `Stripe-Version: 2026-10-28.endive`. With no key set, the billing UI hides itself and the routes answer 503.
  - The official SDK is not added because this build environment cannot install packages, and CI installs from the lockfile. Only two endpoints are needed (Checkout Sessions and Portal Sessions).
  - Swapping in the SDK later is a contained change. (Builder's call.)

### AI access

- A new switch, `ZAVQERA_AI_ACCESS`:
  - `plans`: every signed-in user may generate, limited by their plan's monthly quota.
  - anything else, or unset: today's allowlist.
- Deploy Previews get `plans`. Production keeps the allowlist until the owner reviews and flips it.
- All other gates stay as they are: provider switches, rate limit, cost estimate and quota reservation.

### Pages

- **`/app/billing`.**
  - Shows the current plan, status, renewal or end date and AI used this month.
  - Has a button for each paid plan, or "Manage billing" when subscribed.
  - Shows a return state after Checkout: "Your payment is being confirmed". It polls `billing_overview` until the webhook lands, and never treats the redirect as proof.
- **`/pricing`.** The paid cards link to `/app/billing` when billing is configured, and keep the interest form otherwise. The "proposed pricing, not active" notice changes only in the environment where billing is on.
- **Translations and privacy.** All strings go into the five dictionaries. The privacy notice adds Stripe as a processor and a billing purpose row, worded for the Sandbox phase.

### Secrets: names and places only

| Name | Where | Context | Created by |
|---|---|---|---|
| `STRIPE_SECRET_KEY` (restricted `rk_test_`) | Netlify, marked secret, Functions scope | Deploy Previews and Branch deploys only | owner |
| `STRIPE_WEBHOOK_SECRET` | Supabase Development, Edge Function secrets | — | owner, copied from the Stripe endpoint |
| `ZAVQERA_AI_ACCESS=plans` | Netlify | Deploy Previews only | owner or Claude (not a secret) |

Restricted key permissions (start minimal; widen only on a 403 during testing):

- Checkout Sessions: Write
- Customer portal: Write
- Customers: Read
- Prices: Read

Webhook endpoint in the Sandbox:

- URL: `https://mrwmmbytcymqgwvcoywd.supabase.co/functions/v1/stripe-webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `charge.refunded`
  - `charge.dispute.created`
  - `radar.early_fraud_warning.created`

### Testing

**Automated (CI):**

- plan and price mapping;
- status-to-entitlement table;
- signature verification, including good, bad, stale and replayed signatures;
- route guards: no client-chosen price, no client-chosen customer;
- i18n and rpc-signature guards.

**Database proofs on Development** (rollback-only, as done for invitations):

- a duplicate event;
- out-of-order created/updated;
- `past_due` drops the user to free;
- cancel-at-period-end keeps the plan;
- deleted drops to free;
- a customer that is already linked to another user is refused.

**Owner, in the preview** (Stripe test cards only; Claude cannot type card numbers or passwords there):

- handover tests 1–14;
- duplicate delivery tested with the Dashboard's "Resend" on a delivered event;
- a failed renewal tested with a test clock or the decline-after-attach card.

### Left to the builder

File layout, component structure and copy wording, inside the rules above.

## Open items before live (not this build)

- Live products and prices, a live restricted key, a live webhook and Production migration review.
- Adaptive Pricing behaviour on renewals: whether the local amount is re-converted each period. Verify against Stripe docs and note it on the billing page.
- VAT and MVA: registration and Stripe Tax, after the accountant's review.
- Legal details and the Norwegian review. Launch is NO-GO until those are done.

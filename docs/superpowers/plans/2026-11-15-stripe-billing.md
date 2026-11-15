# Stripe Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paid Plus, Pro and Scale through Stripe Checkout. Each plan's monthly AI limit is enforced by the existing quota, and access is kept in step with Stripe by a verified webhook.

**Architecture:** A Supabase migration adds the billing tables and one service-role-only function, `private.apply_stripe_event(jsonb)`. A Supabase Edge Function verifies the Stripe signature and calls that function. The Next.js routes create Checkout and Portal sessions through a small `fetch` client using a restricted key. The AI routes are gated by `hasAiAccess()`: plans mode or the allowlist.

**Tech Stack:** Next.js 15 route handlers (TypeScript and ESM `.mjs`), node:test, Supabase Postgres (plpgsql), Supabase Edge Functions (Deno), and the Stripe REST API pinned at `2026-10-28.endive`.

**Spec:** `docs/superpowers/specs/2026-11-15-stripe-billing-design.md`

## Global Constraints

- **Limits are exact:** free 1, plus 10, pro 30, scale 90.
- **Stripe settings:**
  - no `payment_method_types`;
  - no `automatic_tax`;
  - Adaptive Pricing on;
  - `Stripe-Version: 2026-10-28.endive`.
- **The browser never supplies a price id, customer id or user id.**
- **Access by status:** only `active` or `trialing` with a known price grants a paid plan; everything else is free.
- **Secrets are never logged, returned or committed.** Their names are `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- **Production is not touched.** The migration and the price seed are applied to Development only. Production waits for the owner's review.
- **AI access:** `ZAVQERA_AI_ACCESS=plans` opens AI by plan. Unset, the allowlist applies exactly as today.
- **Every visible string is in the five dictionaries.**

## Review Focus

1. **Out-of-order arrival.** A `customer.subscription.created` that arrives before `checkout.session.completed` must still find its user, through `metadata.user_id`.
2. **Mid-month plan change.** Changing plan mid-month must change this month's limit, not only next month's.
3. **Downgrade below current usage.** After a downgrade where usage is already above the new limit, the next reservation must be refused, and the count must not be reset.
4. **Provider details in plans mode.** A signed-in non-operator must not learn the provider configuration from refusal messages.
5. **A second subscription.** A person with an active subscription who opens checkout again must be sent to the Portal instead.

---

### Task 1: Database (Development)

**Files:**
- Create: `supabase/migrations/20261115220000_stripe_billing.sql`
- Test: `apps/web/test/billing-schema.test.mjs`

**Interfaces:**
- Produces:
  - `public.billing_checkout_context(p_plan text) returns table(price_id text, customer_id text, has_active_subscription boolean)`
  - `public.billing_overview() returns table(plan text, status text, cancel_at_period_end boolean, current_period_end timestamptz, monthly_limit int, generations_used int)`
  - `private.apply_stripe_event(p_event jsonb) returns text`, which returns `'processed'`, `'duplicate'` or `'ignored'`. It is executable by `service_role` only.

Steps:

- [ ] **Static test.** Assert that the migration:
  - contains the four `private.billing_*` tables;
  - grants execute on `apply_stripe_event` to service_role only;
  - has the limit check `free 1 / plus 10 / pro 30 / scale 90`;
  - sets the default `coalesce(v_limit, 1)` in `reserve_ai_generation`.

  Run it and watch it fail.
- [ ] **Write the migration.**
  - Normalise the existing usage and entitlement rows to the new limits before re-adding the checks.
  - Set the entitlement in one function, `private.set_plan(user, plan)`, which also updates the current month's usage row.
  - Apply an update only when `event.created >= last_event_created`.
- [ ] **Apply to Development.** Seed `private.billing_prices` with the three Sandbox price ids, which is data and not part of the migration.
- [ ] **Rollback-only proof on Development**, ending in `raise exception 'PROOF_OK'`. It covers:
  - a duplicate event;
  - subscription.created before checkout;
  - an older update after a newer one;
  - `past_due` gives free;
  - cancel-at-period-end with `active` keeps the plan;
  - deleted gives free;
  - a customer linked to a second user is refused;
  - an upgrade changes this month's limit;
  - a downgrade below usage refuses the next reservation.
- [ ] **Commit.**

### Task 2: Signature verification and the Edge Function

**Files:**
- Create: `supabase/functions/_shared/stripe-signature.mjs`
- Create: `supabase/functions/stripe-webhook/index.ts`
- Test: `apps/web/test/stripe-signature.test.mjs`

**Interfaces:**
- Produces: `verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds?: number, toleranceSeconds = 300): Promise<{ ok: true } | { ok: false, reason: "missing" | "malformed" | "stale" | "mismatch" }>`

Steps:

- [ ] **Tests.** The verifier must:
  - accept a signature built with node:crypto HMAC;
  - refuse a tampered payload ("mismatch");
  - refuse a timestamp older than 300 seconds ("stale");
  - refuse a missing header ("missing");
  - accept a header carrying several `v1=` values, one of them right.
- [ ] **Implement with WebCrypto.** Use `crypto.subtle` and a constant-time comparison.
- [ ] **Edge Function:**
  - read the raw body with `req.text()`;
  - verify the signature with `Deno.env.get("STRIPE_WEBHOOK_SECRET")`;
  - call `rpc("apply_stripe_event")` with a service-role client;
  - answer 400, 200 or 500;
  - log only the event id and type.
- [ ] **Deploy to Development** with `verify_jwt: false`.
- [ ] **Commit.**

### Task 3: Checkout and Portal routes

**Files:**
- Create: `apps/web/lib/stripe-client.ts`
- Create: `apps/web/lib/billing-plans.mjs` and `.d.mts`
- Create: `apps/web/app/api/billing/checkout/route.ts`
- Create: `apps/web/app/api/billing/portal/route.ts`
- Test: `apps/web/test/billing.test.mjs`

**Interfaces:**
- Produces:
  - `PAID_PLANS = ["plus", "pro", "scale"]`
  - `PLAN_LIMITS = { free: 1, plus: 10, pro: 30, scale: 90 }`
  - `isPaidPlan(value: unknown): value is "plus" | "pro" | "scale"`
  - `checkoutSessionParams({ priceId, customerId, email, userId, origin, label }): URLSearchParams`
  - `stripeRequest(path: string, params: URLSearchParams): Promise<{ ok: boolean, status: number, data: any }>`
  - `billingConfigured(): boolean`

Steps:

- [ ] **Tests:**
  - plan validation;
  - the params carry `mode=subscription`, `client_reference_id`, `subscription_data[metadata][user_id]` and `adaptive_pricing[enabled]=true`;
  - the params contain no `payment_method_types` and no `automatic_tax`;
  - `customer` is used when linked, and `customer_email` otherwise;
  - the routes read the price and customer only from `billing_checkout_context`;
  - the routes never read `body.priceId` or `body.customer`.
- [ ] **Implement.** The checkout route answers 409 "manage your plan" when `has_active_subscription` is true, and 503 when billing is not configured.
- [ ] **Commit.**

### Task 4: AI access by plan

**Files:**
- Modify: `apps/web/lib/ai/gate.ts`
- Modify: `apps/web/app/api/missions/plan/route.ts`
- Modify: `apps/web/app/api/opportunities/analyze/route.ts`
- Test: `apps/web/test/billing.test.mjs`

**Interfaces:**
- Produces: `hasAiAccess(userId: string): boolean` and `aiAccessMode(): "plans" | "allowlist"`

Steps:

- [ ] **Tests:**
  - unset mode, a user not on the list: refused;
  - plans mode: any user is allowed;
  - plans mode, a user not on the allowlist: provider refusals collapse to one generic sentence.
- [ ] **Implement and replace the three call sites. Commit.**

### Task 5: Billing page, pricing, translations and privacy

**Files:**
- Create: `apps/web/app/app/billing/page.tsx`
- Create: `apps/web/components/billing-actions.tsx`
- Modify: `apps/web/app/pricing/page.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Modify: `apps/web/lib/legal.ts`
- Modify: the shell nav (a "Billing" link for signed-in users when billing is configured)
- Test: the existing guards, plus a billing page test

Steps:

- [ ] **Page.** Shows:
  - the plan, status, renewal or end date, and used / limit;
  - a button per paid plan, or "Manage billing";
  - after `?checkout=success`, polling of `billing_overview` for 30 seconds, with the text "Your payment is being confirmed".
- [ ] **Pricing.** When billing is configured the paid cards link to `/app/billing`; otherwise the interest form stays.
- [ ] **Privacy notice.** Add Stripe as a processor and a billing purpose row.
- [ ] **Run the full suite. Commit.**

### Task 6: Ship to the Preview and test with the owner

- [ ] **Open a PR** and wait for green CI and the deploy preview.
- [ ] **Owner sets up:**
  - the restricted key in Netlify (Deploy Previews and Branch deploys);
  - `ZAVQERA_AI_ACCESS=plans` (Deploy Previews);
  - the webhook endpoint and its secret in Supabase Development;
  - then a preview redeploy.
- [ ] **Owner runs handover tests 1–14** in the preview with test cards. Claude verifies each one from the database and from the Stripe events.
- [ ] **Merge only after the tests pass.** Production stays allowlist-only with billing hidden, because it has no key there. Record the results in the project doc.

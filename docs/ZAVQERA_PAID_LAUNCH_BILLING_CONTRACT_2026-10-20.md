# ZAVQERA Paid Launch — Billing Implementation Contract

**Status:** design contract only; not implemented and not release approval.  
**Date:** 2026-10-20  
**Target:** public web launch with Free, Plus ($9/month), and Pro ($25/month).

## Current verified product state

- `apps/web/app/pricing/page.tsx` displays the three plans and explicitly says paid billing is not enabled; Plus/Pro CTAs are inert “Planned for launch” labels.
- `apps/web/package.json` has no payment-provider SDK dependency.
- The web app uses Supabase for authentication and data. Do not trust a client-supplied plan name, checkout redirect, or browser state as proof of payment.
- The existing hosted Development migration history is not in verified parity with the repository. This contract does not authorize any hosted migration or schema change.

## Verified repository-only entitlement and quota map (2026-10-20)

The current application already has a server-side quota boundary, but it does **not** have a payment-backed subscription entitlement source:

- `apps/web/lib/ai-usage.ts` calls `get_ai_usage`, `reserve_ai_generation`, `consume_ai_generation`, and `release_ai_generation` through the authenticated Supabase server client.
- `apps/web/app/api/ai/usage/route.ts` requires an authenticated user and returns the server-derived usage response with `Cache-Control: no-store`.
- `apps/web/app/api/ai/plan/route.ts` authenticates the user, validates the goal, reserves quota before generation, and uses the existing generation service to consume or release the reservation. It requires `OPENAI_API_KEY` in production unless the provider is configured; no key or paid provider setup is implied here.
- Migration `20261001184951_w22_ai_usage_quota_and_reservations.sql` introduced `public.ai_entitlements` and the usage/reservation tables. Migration `20261004191431_w34_plan_quota_constraints.sql` defines the repository's intended Free=5, Plus=50, Pro=300 limits; `20261005080400_w36_enable_pro_plan_identity.sql` permits the `pro` plan identity.
- The current W82 reservation function reads `plan` and `monthly_limit` from `public.ai_entitlements`, defaulting missing rows to Free/5. It does not query a payment provider or independently verify a subscription. Therefore, an entitlement row is currently the plan authority, but there is no verified billing lifecycle that safely populates it from a paid subscription.
- W22's original definitions predate the W34/W36 plan-limit changes. Do not treat a single historical migration as the final schema; use a reviewed, ordered isolated replay and resolve hosted migration provenance before writing a billing migration.

**Implementation consequence:** the next safe code slice is not a checkout button alone. First define and test a provider-neutral, server-only entitlement projection and a single authoritative plan/period contract that the existing quota reservation path can consume. Then implement provider-specific checkout/webhooks behind a disabled-by-default flag, with a new forward migration only after schema/provenance review. Do not grant Plus/Pro based on client input, a success redirect, or manually editable browser state.

## Recommended first implementation

Use **Stripe Checkout + Stripe Billing** for monthly subscriptions, with a provider-neutral internal entitlement boundary. This is a proposed choice for implementation, not evidence that a Stripe account, price IDs, tax configuration, or webhook is configured. Before accepting real payments, confirm the merchant's legal entity, country, currency, consumer terms, VAT/tax handling, refund/cancellation policy, and Stripe account eligibility. Do not put secret keys in source control.

Keep the first paid release deliberately narrow:
- Free: 5 successful AI generations per billing month.
- Plus: 50 successful AI generations per billing month, proposed price USD 9/month.
- Pro: 300 successful AI generations per billing month, proposed price USD 25/month.
- No annual billing, trials, credits rollover, team billing, or usage-based overage until monthly billing and reconciliation are proven.

## Required server-side flow

1. An authenticated user requests a checkout session for an allow-listed internal plan key (`plus_monthly` or `pro_monthly`). The server maps that key to a server-configured Stripe Price ID; the browser never chooses a price amount or supplies an arbitrary Price ID.
2. The server creates a Stripe Checkout Session with the authenticated user UUID in validated metadata/client reference, a trusted configured return URL, and idempotency protection.
3. A return to the success URL only displays “payment processing/confirming”. It must never grant entitlement.
4. A signature-verified Stripe webhook handles subscription lifecycle and invoice payment events. Persist each provider event ID once, transactionally, and safely ignore duplicate deliveries.
5. Persist a minimal subscription projection keyed to the authenticated internal user ID and provider customer/subscription IDs. Record status, plan key, current period boundaries, cancellation-at-period-end, and the last successfully processed event. Treat out-of-order events safely; retrieve canonical provider state when an event cannot be reconciled confidently.
6. Derive the effective plan on the server from verified provider state. Define explicit access for `active`, `trialing` (not used initially), `past_due`, `unpaid`, `canceled`, and `incomplete`; do not infer paid access from a client profile field.
7. Enforce monthly generation limits atomically in the server-side reservation/settlement path already used by the application. The usage counter and billing period must be authoritative and concurrency-safe; never allow parallel requests to exceed the limit. Failed/refused generations should not be billed as successful generations, and retries must be idempotent.
8. Provide an authenticated billing portal/session route for managing cancellation and payment methods. Validate ownership on the server.
9. Add operational logs/alerts for webhook failures, event lag, entitlement reconciliation failures, and unusual quota consumption. Do not log payment secrets or unnecessary personal/payment data.

## Configuration required (never commit values)

- Server-only `STRIPE_SECRET_KEY`
- Server-only `STRIPE_WEBHOOK_SECRET`
- Server-only allow-listed `STRIPE_PRICE_PLUS_MONTHLY` and `STRIPE_PRICE_PRO_MONTHLY`
- Trusted public application origin for return URLs
- Supabase server-side credentials only where the existing trusted server boundary requires them; never expose service-role/secret keys to the browser.
- Separate test and live keys, prices, webhook endpoints, and deployment contexts. Keep live billing disabled until the test-mode gate passes.

## Data and security design requirements

- Use a new forward migration with a unique timestamp only after the hosted migration provenance/parity issue is resolved and the migration is reviewed. Do not edit historical migrations or apply a candidate migration to hosted Development/Production as part of this work.
- Suggested logical records: `billing_customers` (internal user ↔ provider customer), `billing_subscriptions` (provider subscription projection), `billing_webhook_events` (idempotency/audit), and a period-scoped usage ledger or an equivalent extension of the existing atomic AI reservation mechanism. Final names/columns must be reconciled with the current schema before writing SQL.
- Browser roles must not directly insert/update billing projections, webhook events, plan entitlements, or authoritative usage counters.
- Verify webhook signatures against the raw request body. Reject unsigned/invalid requests. Do not trust client metadata without confirming the user/session relationship.
- Never downgrade or grant a plan solely from a checkout redirect. Never treat a provider API timeout as proof of payment.
- Use least privilege, RLS where appropriate, server-only writes, constraints, and transactional idempotency.

## Release test matrix — all required

### Checkout and lifecycle
- Unauthenticated checkout rejected; unknown plan key rejected; client-supplied amount/Price ID ignored.
- Checkout session created only for the signed-in user and an allow-listed configured price.
- Invalid webhook signature rejected.
- Checkout success without a verified webhook grants no paid entitlement.
- Duplicate webhook delivery has one effect; out-of-order events cannot restore an obsolete subscription state.
- Successful initial payment grants the correct plan; failed payment, cancellation, refund/charge dispute where applicable, and subscription deletion follow the documented access policy.
- Billing portal only opens for the authenticated user's own customer record.

### Usage and concurrency
- Free/Plus/Pro limits are enforced on the server (5/50/300).
- Parallel reservations cannot exceed the limit; retries and duplicate settlements are idempotent.
- Usage resets only at the intended provider billing-period boundary; failed generations are handled consistently.
- Client-side plan tampering, direct API calls, cross-user IDs, and expired/canceled subscription states do not grant extra usage.

### Delivery and operations
- Test-mode end-to-end purchase, webhook delivery, subscription cancellation, and failed payment are demonstrated with evidence.
- Production environment has separate live keys/price IDs and the verified production webhook endpoint.
- Database backup/rollback and webhook replay/reconciliation procedures are documented.
- Legal pages, pricing disclosures, tax/VAT treatment, invoice/receipt handling, customer support contact, and refund/cancellation terms are reviewed before live payments.
- Manual desktop/mobile QA verifies pricing, checkout return, account state, cancellation, and localized English/Norwegian/Arabic user-facing messages.

## Go/no-go rule

Do not advertise paid plans as purchasable or enable live keys until the entire test matrix passes on the intended release commit, the current hosted schema/migration provenance is independently reviewed, live webhook delivery is verified, and the owner explicitly approves production billing activation. CI success on isolated databases is necessary but not sufficient.

## Immediate next engineering sequence

1. Inspect the current AI quota/reservation implementation and hosted schema contract; map exactly where plan entitlement is read and where usage is reserved/settled.
2. Resolve the hosted migration ledger/provenance review before preparing a new billing migration.
3. Implement a server-only provider adapter, checkout route, signed webhook route, billing portal route, and database-authoritative subscription/usage model behind a disabled-by-default feature flag.
4. Add isolated PostgreSQL/pgTAP tests for RLS/grants, event idempotency, lifecycle transitions, and concurrent quota reservations.
5. Add Stripe test-mode E2E checks with test credentials supplied only as repository/deployment secrets; verify cancellation and failed payment as well as success.
6. Only after evidence and review, enable test-mode UI and then request explicit production activation approval.

**No provider account, keys, prices, database changes, deployment, or live payments are created by this document.**

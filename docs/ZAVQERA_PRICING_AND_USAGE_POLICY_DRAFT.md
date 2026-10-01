# ZAVQERA pricing and AI usage policy — launch draft

Status: proposal; billing is not enabled yet.

## Free

- Price: 0 per month.
- AI planning allowance: 20 successful generations per UTC calendar month.
- Core missions, task management, and saved user data remain available after the AI allowance is exhausted.
- Maximum goal input: 1,200 characters.
- Maximum model output: 700 tokens for the current planner request.

## Plus — proposed

- Price target: 9.99 per month at initial pricing test.
- AI planning allowance: 300 successful generations per billing month.
- No paid overage at launch; hard quota prevents surprise AI charges.
- Paid entitlement activation requires a verified payment-provider webhook before this tier can be sold.

## Product rules

- Quota is enforced server-side and atomically.
- The browser cannot modify usage counters or entitlement records.
- Failed provider requests release the reserved generation.
- Users are never silently upgraded or auto-charged.
- Remaining quota and reset period are shown in the product.
- Pricing and allowance values are hypotheses to validate with real retention, conversion, support, and inference-cost data.

## Current implementation status

- Free entitlement default and 20-generation monthly quota: implemented in Development.
- 300-generation Plus entitlement definition: implemented as a server-side entitlement shape, but not activated for customer billing.
- Checkout, subscription webhook verification, cancellation, taxes, invoices, and paid access controls: not implemented.
- Public launch remains blocked by the existing W21, provider-live AI, and Mission Authority release gates.

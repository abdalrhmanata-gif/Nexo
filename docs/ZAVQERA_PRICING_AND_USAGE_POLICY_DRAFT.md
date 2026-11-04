# ZAVQERA pricing and AI usage policy — launch draft

Status: proposal; billing is not enabled yet.

## Free

- Price: $0 per month.
- AI planning allowance: **5 successful generations per UTC calendar month**.
- Core missions, task management, and saved user data remain available after the AI allowance is exhausted.
- Maximum goal input: 1,200 characters.
- Maximum model output: 700 tokens for the current planner request.

## Plus — proposed

- Price target: **$9 per month** at initial pricing test.
- AI planning allowance: **50 successful generations per month**.
- No paid overage at launch; hard quota prevents surprise AI charges.
- Paid entitlement activation requires a verified payment-provider webhook before this tier can be sold.

## Pro — proposed

- Price target: **$25 per month** at initial pricing test.
- AI planning allowance: **300 successful generations per month**.
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

- Free=5, Plus=50, and Pro=300 are the release-candidate quota tiers in Development.
- Plan identity and monthly-limit database constraints accept all three tiers.
- Checkout, subscription webhook verification, cancellation, taxes, invoices, and paid access controls: not implemented.
- Paid plan buttons remain informational in the preview; billing is not active.
- Public launch remains blocked by the existing provider-live AI, hosted password-reset, and Mission Authority release gates.

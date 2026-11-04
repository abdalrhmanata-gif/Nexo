# Opportunity Intelligence MVP

## Product decision

Opportunity Intelligence should be Zavqera's route from **signal → evidence → decision → Mission → outcome**, not a generic list of AI-generated ideas. The first cut delivers a transparent decision workflow without introducing new database objects, external provider dependencies, or unverified claims of automated discovery.

## In this MVP

- Capture an opportunity hypothesis, intended audience, and an optional public source reference.
- Rate five explicit factors (1–5): strategic fit (25%), potential value (25%), timing (15%), evidence strength (20%), and execution ease (15%; inverse of estimated effort).
- Rank opportunities using the visible, deterministic 20–100 score.
- Treat a high score as **a reason to validate**, never as an instruction to proceed: source links are user-provided and not independently verified.
- Convert an opportunity to a prefilled Mission with evidence review, assumption testing, decision criteria, initial steps, and a concise handoff of the first two recorded sources.
- Open prefilled public web-search and news-search queries in the user's browser; display the exact query before opening and warn that Google receives those terms. No search result is fetched or represented as verified by the app.
- Maintain a local evidence ledger for each opportunity: source URL/title, user's observation in their own words, source type, date published (when known), review timestamp, user-estimated reliability, and whether the observation supports, challenges, or only contextualizes the thesis.
- Detect duplicate source URLs after removing fragments and common tracking parameters, including duplicates against the original source field.
- Surface support and counter-signals side by side; recording evidence does not certify a claim as true.
- Keep the opportunity list and evidence notes in browser local storage on that device. Do not send these records to the backend.

The score is a prioritization aid, not probability, verified market evidence, financial advice, or a revenue forecast. Score and evidence quality are user-entered judgments in this version.

## Explicitly not in this MVP

- Automatic/live web discovery, crawling, automatic source verification, and market-size or revenue estimates. Search links launch an external search page; the user must review and record useful sources manually.
- Scheduled monitoring, alerts, multi-user collaboration, account-level synchronization, and outcome-based model learning.
- New Supabase tables, RPCs, Edge Functions, or changes to Supabase Main.
- Automatic outreach, purchases, commitments, or other external side effects.

## Recommended product progression

1. **Validate usage:** observe whether users add opportunities, attach sources, create Missions, and return to update their decisions.
2. **Evidence-backed discovery:** only after an approved research-provider path exists, discover opportunities from public sources, preserve source URLs and timestamps, de-duplicate signals, and distinguish extracted facts from generated hypotheses.
3. **Personalized ranking:** rank against a user's declared goals, constraints, capacity, and explicit risk appetite; expose why the rank changes.
4. **Closed-loop intelligence:** compare ranked opportunities with real Mission outcomes and user-confirmed value; never treat an unverified agent claim as a successful outcome.
5. **Paid value:** test recurring discovery and monitoring as a paid tier only after users show repeat usage and value.

## Release gates

- Scoring and evidence-ledger modules have deterministic unit tests for input bounds, unsafe URLs, duplicate sources, mixed signals, and priority explanations.
- Opportunity creation, removal, local persistence, and mission prefill must pass the web build and integration checks.
- Verify mobile layout and keyboard/screen-reader access for the evidence panel, form labels, details/summary rows, and source links.
- Review browser-storage and external-search privacy wording; show what query is sent to Google and avoid collecting sensitive personal data.
- Keep the feature opt-in and disclose that search is browser-led, source observations and reliability are user-entered, and no source is independently verified.
- Do not add persistent backend storage or automated browsing to a hosted environment without a separate reviewed architecture change.


## Deploy Preview security-scan note (2026-10-28)

The Netlify Deploy Preview scanner had flagged the public Supabase publishable key in the generated middleware because an obsolete site environment variable was misconfigured with the key's value as the variable name and marked secret. The malformed variable was removed after confirming it was not referenced by repository code. The correctly named `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` remains non-secret; the Netlify secret scanner remains enabled. The currently published Netlify deploy was not changed. A new Deploy Preview must complete successfully before this feature is considered operationally verified on Netlify.

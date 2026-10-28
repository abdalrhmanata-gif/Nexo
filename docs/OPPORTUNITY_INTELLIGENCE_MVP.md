# Opportunity Intelligence MVP

## Product decision

Opportunity Intelligence should be Zavqera's route from **signal → evidence → decision → Mission → outcome**, not a generic list of AI-generated ideas. The first cut delivers a transparent decision workflow without introducing new database objects, external provider dependencies, or unverified claims of automated discovery.

## In this MVP

- Capture an opportunity hypothesis, intended audience, and an optional public source reference.
- Rate five explicit factors (1–5): strategic fit (25%), potential value (25%), timing (15%), evidence strength (20%), and execution ease (15%; inverse of estimated effort).
- Rank opportunities using the visible, deterministic 20–100 score.
- Treat a high score as **a reason to validate**, never as an instruction to proceed: source links are user-provided and not independently verified.
- Convert an opportunity to a prefilled Mission with evidence review, assumption testing, decision criteria, and initial steps.
- Keep the opportunity list in browser local storage on that device. Do not send these records to the backend.

The score is a prioritization aid, not probability, verified market evidence, financial advice, or a revenue forecast. Score and evidence quality are user-entered judgments in this version.

## Explicitly not in this MVP

- Live web discovery, crawling, automatic source verification, and market-size or revenue estimates.
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

- The scoring module has deterministic unit tests for extreme values, bounds, thresholds, and explanations.
- Opportunity creation, removal, local persistence, and mission prefill must pass the web build and integration checks.
- Verify mobile layout and keyboard/screen-reader access.
- Review browser-storage privacy wording and avoid collecting sensitive personal data.
- Keep the feature opt-in and clearly disclose that this first version does not discover or independently verify sources.
- Do not add persistent backend storage or automated browsing to a hosted environment without a separate reviewed architecture change.

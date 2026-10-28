# ZAVQERA Opportunity Intelligence — Product Strategy

**Status:** Product direction and launch-price hypotheses; not a statement that planned AI capabilities are live.  
**Research checkpoint:** 2026-10-28. Competitor websites are marketing material and were not independently audited.

## Executive decision

Opportunity Intelligence should become a core reason to subscribe to ZAVQERA, included within the monthly plan allowance rather than sold as an unexpected per-report add-on. But it must not be positioned as “AI that gives an idea a score.” Scores are easy to copy and can create false confidence.

The intended product is **evidence-to-execution intelligence**:

> Bring an idea, a goal, or a market signal. Zavqera helps you discover what is known, challenge what is assumed, find what could make the opportunity fail, choose the cheapest meaningful test, and turn the decision into a governed Mission.

The defensible difference should be the connected journey from user context and evidence to a decision, action, and recorded outcome—not the size of a model or an unsupported claim to have the world's best data.

## What the current code actually does

The present Opportunity Intelligence MVP:
- Uses a deterministic weighted score from user-entered ratings.
- Stores opportunities and their evidence notes in browser localStorage.
- Allows user-provided source URLs and browser-led search links; it does not run a crawler or an in-feature search API.
- Records supporting, challenging, and contextual evidence entered by the user.
- Converts an opportunity into a prefilled Mission for the user to review.
- Does **not** invoke an AI model for opportunity analysis, retrieve and verify market data automatically, or monitor competitors on a schedule.

Therefore the current score is a prioritization aid, not a market validation, forecast, probability of success, or financial recommendation. The current MVP can remain useful as the transparent baseline while AI capabilities are built.

## Market signals observed

Public product pages reviewed on 2026-10-28 show a competitive category with reports, evidence, competitor analysis and, for some products, ongoing monitoring:

- **SignalDart** advertises startup validation, competitor discovery and competitor pricing, search-demand and market-gap analysis, cited reports, an AI strategy adviser, and competitor monitoring. Its page lists a $4.99 one-off Idea Pass and monthly Starter / Professional plans at $39 / $99. Source: https://signaldart.com/
- **Orbis** advertises a ten-dimension market-intelligence report, a Build / Pivot / Skip verdict, competitor and demand evidence, and an AI adviser. Its public page lists two free reports and an Unlimited offer at $19/month. Source: https://www.tryorbis.com/
- **Preuve AI** advertises source-linked findings from 60+ sources, a map of up to 15 competitors, market sizing and evidence-backed pivot suggestions. Its page lists a $59 one-off Founder Report. These are vendor claims, not an independent audit. Source: https://preuve.ai/
- **Exploding Topics** sells trend discovery and tracking. Its public pricing page lists Entrepreneur at $39/month with 10 analyses, Investor at $99/month with 100 analyses, and Business at $249/month with 500 analyses. Source: https://explodingtopics.com/pricing

### Implication for ZAVQERA

A generic score or generic AI report is not enough. A credible paid product must deliver evidence that can be checked, expose uncertainty, recommend an actionable test, preserve the user's decision process, and carry the approved next step into ZAVQERA Missions. Do not compete by claiming more data sources than have actually been connected.

## Proposed AI Opportunity Brief

A completed report should be structured and consistent, not an unbounded chat response.

1. **Decision at a glance:** Test, pursue, pivot, defer, or stop; explain why and list the strongest reason not to proceed.
2. **Customer and problem:** Target user, job-to-be-done, current workaround, urgency, and assumptions that still need user confirmation.
3. **Evidence ledger:** Every material factual claim has a source URL, source title, retrieval/review date, and a clear status: evidence, inference, counter-evidence, or unknown. Record confidence and source limitations.
4. **Competitor map:** Relevant alternatives (including manual workarounds), target customer, published price when available, strengths, weaknesses, and sources. Mark unavailable information as unknown—never invent prices, users, revenue, market size or funding.
5. **Demand and willingness to pay:** Separate real observed signals from proxies and inference. A forum complaint is not proof of broad demand; a trend is not proof of purchase intent.
6. **Opportunity gap:** A specific underserved segment or job, why the gap may exist, evidence against it, and how hard it would be to copy.
7. **Risks and kill criteria:** Distribution, regulation, platform dependence, operational complexity, competition, willingness-to-pay, and the facts that would disprove the thesis.
8. **Cheapest next experiment:** One small test, target participant/sample, estimated time/cost with assumptions, metric, success threshold, failure threshold, and next review date.
9. **ZAVQERA Mission:** Prefill a Mission from the test plan, preserve the evidence references and uncertainty, and require user review before creation.

The report should show its method, its evidence gaps, and an explicit “not enough evidence” result when appropriate. Never make confidence appear more precise than the source data justifies.

## Differentiation worth paying for

- **Skeptical analyst, not cheerleader:** It must be able to recommend no-go, narrower positioning, or a pivot.
- **Source-level traceability:** Let the user jump from a conclusion to the underlying source and challenge it.
- **Opportunity comparison:** Compare candidates against the same user-defined goal, constraints, budget, skills and time horizon.
- **From insight to action:** Convert the best test to a Mission with measurable success criteria, not just a downloadable report.
- **Living evidence:** Later, notify the user when tracked sources change and show what changed, when, and why it matters.
- **Memory with permission:** Reuse only research in the user's workspace that the user is authorized to access; provide a way to correct or delete it.

## Proposed subscription hypothesis — not activated

Keep Opportunity Intelligence inside the normal monthly plan. Its full AI report allowance should be clearly counted and limited; the user should not get a surprise charge per report.

| Proposed plan | Indicative price | Planned AI Opportunity Briefs | Intended customer |
| --- | ---: | ---: | --- |
| Free | $0/month | 1 per month | Try the workflow and keep a basic evidence ledger |
| Plus | $19/month | 10 per month | Solo founder or professional testing opportunities regularly |
| Pro | $49/month | 30 per month | Active founder comparing opportunities and reusing reports |

These are launch hypotheses, not active prices or entitlements. The current pricing page should label them as proposed until validated. The first report limit, final allowance, report depth, and currency should be tested against real model/retrieval cost and customer interviews. Do not promise recurring monitoring, source coverage, exports, or AI reports until their actual path is implemented and tested. If monthly usage is shared with other AI tasks, show the balance and explain exactly what one report consumes.

A strong trust offer is more attractive than “unlimited AI”: one useful free report, cited findings, an explicit no-go recommendation when evidence is weak, and a predictable allowance. Avoid fake scarcity and fabricated testimonials.

## Implementation architecture and guardrails

### Phase 1 — useful AI analysis on reviewed evidence

- Introduce a provider-neutral server-side Opportunity Analysis contract; do not bind the core feature to one model vendor.
- Input should include the opportunity hypothesis, audience, user constraints, ratings, and user-approved evidence notes/URLs. Where source page content is not actually available to the model, say so; do not imply a page was read merely because a URL was supplied.
- Return a typed report with decision, claims, source references, evidence class, confidence rationale, counter-evidence, unknowns, experiment and Mission fields.
- Validate output shape, bound lengths, handle timeout/provider failure, and display an honest fallback. Preserve deterministic local scoring as a separate signal rather than presenting model opinion as a verified score.
- Keep provider secrets server-only. Add authentication/ownership checks, request limits, usage metering, idempotency for retries, cost ceilings, and error logging that excludes sensitive user content.
- Do not store private report content in shared logs or send it to a provider without clear disclosure and an appropriate retention/privacy policy.
- No AI key or provider implementation is currently confirmed as wired into Opportunity Intelligence. Do not call a real paid API, add a paid integration, or change billing without approval and a cost review.

### Phase 2 — source-supported market research

Only after selecting a lawful, reliable source/retrieval route:
- Retrieve from explicit, permitted sources; record canonical URL, title, timestamp, and source type.
- Normalize and deduplicate URLs; reject non-HTTP(S) and unsafe targets.
- Distinguish source statements, model synthesis and user assumptions.
- Report coverage honestly; support, contradict and missing evidence must remain visible.
- Add regression fixtures for stale, missing, conflicting, duplicate and inaccessible sources.

### Phase 3 — monitoring and team workflows

- Add scheduled change checks only when source access, scheduling, per-account limits and cost are understood.
- Alerts should link to the exact change and source, not just say “the market changed.”
- Add workspace ownership, permissions, export and deletion semantics before sharing reports across teammates.
- Monitoring should be an included, capped plan allowance only once real costs and operational reliability are proven.

## Release gates

Do not announce AI Opportunity Intelligence as live until all are true:
1. An approved non-production provider credential/configuration exists; there is no provider key in client code.
2. Cost per completed/failed report is measured with per-user limits and graceful budget exhaustion.
3. Every factual claim in the evaluation set is source-backed or explicitly marked inference/unknown; hallucinated numbers are a release blocker.
4. A benchmark set covers several industries, unsupported ideas, contradictory evidence, and weak/no-evidence cases; reviewers score factuality, citations, decision usefulness and calibration.
5. AI failure, timeout, duplicate submission, unauthorized access and quota-exhaustion tests pass.
6. The user can inspect report provenance, challenge an assumption, and approve before a Mission is created.
7. Pricing, privacy copy, plan quota enforcement, account usage and cancellation semantics match the actual product.
8. Preview and mobile/accessibility checks pass. Production remains unchanged until an explicit release decision.

## Measures of product value

Track only the minimum needed, with privacy in mind:
- First-session activation: user completes an Opportunity Brief.
- Evidence coverage: material factual claims with valid sources versus inference/unknown.
- Decision usefulness: users mark the report as helpful and can explain the next test.
- Conversion: briefs turned into reviewed Missions; experiments completed.
- Retention: users return to compare or update an opportunity after new evidence.
- Business: paid conversion, cancellation reason, support burden, cost per completed report and gross margin.
- Reliability: source failure, hallucination, invalid report, timeout and quota-error rates.

The north-star outcome should be **a better evidenced decision followed by a completed validation action**, not number of AI tokens or reports generated.

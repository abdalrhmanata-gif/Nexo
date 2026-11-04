# AI Opportunity Analyst — safe setup

## What this changes

The Opportunity Intelligence page now has an explicit **Generate AI brief** action. It sends the opportunity and up to the ten most recent evidence notes to a server-side route, which checks the signed-in user, validates the request, calls the official OpenAI Chat Completions API, validates the returned JSON, and displays a report that the user can review and turn into a prefilled Mission.

It does not fetch or crawl the note URLs. A URL alone is not treated as evidence that Zavqera has read the page. The model is instructed to use only evidence notes supplied by the user and to label inference and unknowns separately. The server rejects unsupported evidence IDs and factual claims with no source ID. This structural validation cannot prove that a note semantically supports a claim, so human review remains required.

## Existing Netlify OpenAI variables

The current Netlify site already has `OPENAI_API_KEY` and `OPENAI_MODEL` configured for Deploy Previews and Production. The route now reuses those variables, defaults to the official endpoint `https://api.openai.com/v1/chat/completions`, and accepts the explicit overrides below. It does not need the key to be copied or exposed again.

## Enable only for a test deployment

The route remains disabled unless `ZAVQERA_AI_ENABLED=true`. In Netlify, set this variable for **Deploy Previews only**, not Production. The server code also hard-blocks Netlify Production and requires `ZAVQERA_AI_ALLOWED_USER_IDS` to contain the signed-in Supabase user ID. If the allowlist is missing or the user is not listed, no AI provider call is made. Keep this allowlist limited to trusted testers while a provider-level hard spend limit is pending.

The route uses the existing `OPENAI_API_KEY` and `OPENAI_MODEL` if no `ZAVQERA_AI_API_KEY` / `ZAVQERA_AI_MODEL` override is supplied. Optional overrides:

- `ZAVQERA_AI_BASE_URL=https://api.openai.com/v1`
- `ZAVQERA_AI_API_KEY=...` (optional; server-side secret only)
- `ZAVQERA_AI_MODEL=...` (optional; defaults to existing `OPENAI_MODEL`)
- `ZAVQERA_AI_MAX_COMPLETION_TOKENS=1200` (server clamps this to 400–1400)

Keep the AI flag unset or false until you intentionally want to allow provider calls. Never name a secret `NEXT_PUBLIC_*`. Changes to Netlify variables require a new deploy. This code change itself does not set the enable flag or invoke a live provider.

## Request and spending safeguards

- The route requires a signed-in Supabase user and rejects cross-site Fetch Metadata signals.
- The route also compares the browser's `Origin` with the request origin. If `Origin` is absent, it only accepts an explicit `Sec-Fetch-Site: same-origin` signal. Requests without a trustworthy same-origin signal are rejected.
- The route sends one request only per click, limits request bytes and output tokens, times out after 25 seconds, and does not automatically retry. It keeps the provider key on the server and returns `Cache-Control: no-store`.
- The in-memory per-user rate guard allows at most three requests per ten minutes per running server instance. Serverless instances may scale or restart, so this remains best-effort burst protection, not the source of truth for monthly quota or a global spending cap.
- A durable monthly per-user generation quota is enforced through the existing Supabase `reserve_ai_generation` and `consume_ai_generation` RPCs. The slot is reserved atomically and consumed before contacting the provider. Therefore, a provider timeout or error still counts as one generation; this prevents repeated failed attempts from bypassing the monthly allowance.
- Successful responses emit a structured `[zavqera-ai-cost]` event to Netlify function logs with model, prompt/completion token counts and an estimated USD cost; it contains no prompt text or user ID. The estimate uses the published standard `gpt-6-luna` text rates and deliberately charges cached input at the non-cached rate. Unpriced models fail closed until a price entry is added.

## Limits that are not solved by this MVP

- The persistent quota counts generations, not token cost, and is not a global money-spend cap. The preview tester allowlist limits who may call AI, but it does not replace an OpenAI organization/project hard spend limit.
- OpenAI has a dashboard-managed hard monthly spend limit and spend alerts. Configure a low project cap and alerts at 50%, 80%, and 100% in [OpenAI Platform project limits](https://platform.openai.com/settings/organization/projects/proj_IkqspC4ZYobOeK7RRMN83LNj/limits); also set an organization-wide hard limit if this API organization should have an overall ceiling. Hard-limit enforcement is not instantaneous, so some slight overrun is possible. This environment has no connected tool capable of writing those OpenAI billing settings, so they remain an external release gate.
- Do not publicly enable paid Production traffic until the OpenAI hard limit and alerts are verified and global cost-based metering/alerting is implemented and tested.
- The route cannot prove source content is true or that a cited note semantically supports a generated claim. The report provides clickable links to the exact user-supplied notes so users can inspect them.
- It sends the submitted opportunity hypothesis and up to ten evidence notes to OpenAI. The UI discloses this at the point of use; do not use confidential or sensitive data.
- No live provider request was made by this code change. No billing, database, or production environment setting was changed.

## Verification

Run from `apps/web`:

```sh
npm test
npm run typecheck
npm run build
```

The automated tests include request validation, score recomputation, prompt-injection resistance instructions, citation-ID validation, insufficient-evidence behavior, endpoint authentication and opt-in configuration, same-origin request guarding, and no automatic browser storage of generated reports.

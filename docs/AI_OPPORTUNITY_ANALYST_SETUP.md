# AI Opportunity Analyst — safe setup

## What this changes

The Opportunity Intelligence page now has an explicit **Generate AI brief** action. It sends the opportunity and up to the ten most recent evidence notes to a server-side route, which checks the signed-in user, validates the request, calls an explicitly configured OpenAI-compatible Chat Completions endpoint, validates the returned JSON, and displays a report that the user can review and turn into a prefilled Mission.

It does not fetch or crawl the note URLs. A URL alone is not treated as evidence that Zavqera has read the page. The model is instructed to use only evidence notes supplied by the user and to label inference and unknowns separately. The server rejects unsupported evidence IDs and factual claims with no source ID. This structural validation cannot prove that a note semantically supports a claim, so human review remains required.

## Environment configuration

The route is disabled by default. To enable it in a **non-production test deployment only**, configure these server-side runtime environment variables:

- `ZAVQERA_AI_ENABLED=true`
- `ZAVQERA_AI_BASE_URL=https://YOUR-APPROVED-PROVIDER/v1` (the base URL for an OpenAI-compatible `/chat/completions` endpoint)
- `ZAVQERA_AI_API_KEY=...` (server-side secret; do not put it in source control)
- `ZAVQERA_AI_MODEL=...`
- `ZAVQERA_AI_MAX_COMPLETION_TOKENS=1200` (server clamps this to 400–1400)

Keep `ZAVQERA_AI_ENABLED=false` until a provider and test key are explicitly selected. Never name the secret `NEXT_PUBLIC_*`. Change environment variables in the deployment's protected environment settings, never by editing tracked files. This code change does not set provider values or invoke a live provider.

The route sends one request only per click, limits request bytes and output tokens, times out after 25 seconds, and does not automatically retry. It keeps the provider key on the server and returns `Cache-Control: no-store`.

## Limits that are not solved by this MVP

- The in-memory per-user guard allows at most three requests per ten minutes per running server instance. Serverless instances may scale or restart, so this is only a best-effort guard, not a durable user quota or a global spending cap.
- Monthly plan entitlements and billing are not enforced. Do not publicly enable this endpoint for paid usage until persistent per-user metering, concurrency/rate limits, an account-level budget, and alerting are implemented and tested.
- The route cannot prove source content is true or that a cited note semantically supports a generated claim. The report provides clickable links to the exact user-supplied notes so users can inspect them.
- It sends the submitted opportunity hypothesis and up to ten evidence notes to the configured provider. The UI discloses this at the point of use; do not use confidential or sensitive data.
- No provider account, key, monthly quota, or production setting has been configured by this code change.

## Verification

Run from `apps/web`:

```sh
npm test
npm run typecheck
npm run build
```

The automated tests include request validation, score recomputation, prompt-injection resistance instructions, citation-ID validation, insufficient-evidence behavior, endpoint authentication and opt-in configuration, and no automatic browser storage of generated reports.

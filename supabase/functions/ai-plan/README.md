# ZAVQERA AI Plan

Authenticated Edge Function for converting a bounded ZAVQERA goal/intent into a structured mission-plan proposal.

## Secrets

Set `OPENAI_API_KEY` in the Supabase Development project's Edge Function secrets. Do not commit it.

Required: set `OPENAI_MODEL` to an explicitly verified model identifier available to the configured API key. The function fails closed with `503 ai_model_not_configured` when it is unset or blank; no unverified fallback model is used.

## Security boundary

- Requires a valid Supabase user JWT.
- Rejects request bodies larger than 64 KiB before JSON parsing.
- Does not execute external actions or grant authority.
- Returns a proposal only; ZAVQERA policy/authorization must validate it before persistence or execution.
- `OPENAI_MODEL` must be explicitly configured; the function does not guess a default model.
- The per-user in-memory rate limiter is **best-effort only**: it is local to a function instance, can reset on cold starts, and is not a durable quota, abuse-prevention, or billing control.
- The Edge Function fails closed with `503 ai_quota_enforcement_not_configured` until durable, atomic entitlement reservation and success/failure settlement are integrated and verified. Do not enable provider calls by changing the guard alone.
- Provider failure logs record status only and do not emit provider error response bodies or user prompts.

## Client integration and release gate

The repository currently contains two distinct AI-planning paths:

- The web API route `apps/web/app/api/ai/plan/route.ts` uses `apps/web/lib/ai-usage.ts` to reserve, consume, and release AI-generation reservations around provider work.
- The Flutter adapter `lib/application/zavqera_ai_planner.dart` calls this Supabase Edge Function directly. That request path does not yet use the same verified reservation/settlement flow.

Consequently, this Edge Function intentionally remains disabled. If this candidate is deployed as-is, direct Flutter requests to `ai-plan` will receive HTTP 503 with `ai_quota_enforcement_not_configured`. Do not merge/deploy this guard as a complete launch solution until one authoritative path is selected and the user-visible client routing is aligned.

Before enabling provider calls, the chosen path must prove all of the following in isolated tests:
1. Authenticated user identity is preserved server-side; clients cannot supply another user's identity.
2. Reservation is atomic and idempotent for the request ID and request hash.
3. Provider success settles the reservation exactly once.
4. Definite provider failure releases the reservation; uncertain outcomes remain held for reconciliation rather than being blindly released and retried.
5. Quota exhaustion blocks the provider call before cost is incurred.
6. Parallel requests cannot exceed the configured limit.
7. The selected web and Flutter client paths both handle success, quota exhaustion, duplicate requests, and settlement failure consistently.

No hosted schema changes or grants are authorized by this document. The existing hosted migration provenance issue must be resolved before any hosted migration or permission change. The current repository contract alone does not prove that hosted grants and deployed function behavior match.

## Endpoint

`POST /functions/v1/ai-plan`

Body:
- `goal`: string
- `intent?`: { objective?, constraints?, successCriteria?, authorityRequests? }
- `context?`: string

## Verification

The repository's AI Plan Function CI runs bounded-body tests, quota fail-closed guard tests, model configuration tests, and a Deno type check. These checks do not prove hosted configuration, API-key validity, real-provider behavior, quota accounting, or production readiness.

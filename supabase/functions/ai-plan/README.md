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
- The per-user in-memory rate limiter is **best-effort only**: it is local to a function instance, can reset on cold starts, and is not a durable quota, abuse-prevention, or billing control. Do not rely on it for production entitlement enforcement.
- Provider failure logs record status only and do not emit provider error response bodies or user prompts.

## Endpoint

`POST /functions/v1/ai-plan`

Body:
- `goal`: string
- `intent?`: { objective?, constraints?, successCriteria?, authorityRequests? }
- `context?`: string

## Verification

The repository's AI Plan Function CI runs bounded-body unit tests and a Deno type check. These checks do not prove hosted configuration, API-key validity, real-provider behavior, quota accounting, or production readiness.

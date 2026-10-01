# ZAVQERA AI Planner MVP

## Scope

The first AI integration is a signed-in user's goal-to-plan copilot in the Web workspace. It returns a concise summary and 3–6 suggested steps. It is deliberately a draft-only capability: it does not create or modify missions, call tools, send messages, or perform external side effects.

## Configuration

Set these in the Web deployment's server-side environment only:

- `OPENAI_API_KEY`: required provider key. Never prefix it with `NEXT_PUBLIC_`, commit it, or expose it to the browser.
- `OPENAI_MODEL`: optional model override; defaults to `gpt-6-luna`.

The API route checks the authenticated Supabase user before checking provider configuration or making an upstream request. Requests are limited to 1,200 characters, the model response is schema-constrained to at most six steps, the call has a 15-second timeout, and responses are not cached. Upstream errors are not relayed verbatim.

## Not yet production-ready

- No per-user durable rate limit or billing/usage ledger exists yet.
- Provider-backed success cannot be verified until a valid key and model access are configured in a non-production preview environment.
- Add automated integration tests with a mocked provider response, monitor failures/usage, and define retention/privacy language before public release.
- The AI draft must not be described as autonomous execution. Human review is required before users manually adopt suggested steps.

## Test

Run `npm test` and `npm run typecheck` in `apps/web`. The boundary test checks authentication, server-side key handling, bounded input/output and draft-only behavior.

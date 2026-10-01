# ZAVQERA launch gates — current status

Branch: `zavqera/ai-planner-integration`
Base: `zavqera/alternative-web-deployment`
Production/main: untouched.

## CI
PASS on current head `e98cdac92cb608b05f371e147bb0ead8d62fc518`:
- ZAVQERA Web Unit: PASS
- ZAVQERA Web CI: PASS
- ZAVQERA Flutter CI: PASS

## W25
PASS for the isolated PostgreSQL two-session atomic fence proof on commit `46dc6029f084fb000ba511d6e8aec3eb532b3`.

Evidence:
- `W25_ATOMIC_FENCE=PASS`
- `budget_concurrency=PASS`
- `idempotency_uniqueness=PASS`
- PostgreSQL 17 service
- teardown completed successfully

Scope limit: this proves the isolated budget/idempotency concurrency property only. It does not by itself prove every production Mission Authority rule.

## W21
OPEN / NOT EXECUTED.

Required evidence remains the disposable local Supabase browser E2E, including authenticated flows and verified Docker cleanup. No hosted Development E2E and no Supabase Main changes.

Execution requires the protected GitHub secret `ZAVQERA_DEVELOPMENT_DB_URL` pointing only to Development project `mrwmmbytcymqgwvcoywd`. Repository migrations are not a substitute because they do not contain the complete historical/auth/provenance schema required by W21.

## AI planner
IMPLEMENTED in PR #29 on `zavqera/ai-planner-integration`.

Current behavior:
- authenticated server-side OpenAI Responses API call
- goal -> summary + 3–6 suggested steps
- structured JSON schema validation
- server-only `OPENAI_API_KEY`
- 1,200-character input cap
- 700 output-token cap
- 15-second timeout
- no response caching
- no mission writes
- no external actions
- human review before adopting suggestions

Default model: `gpt-6-luna`, configurable with `OPENAI_MODEL`.

Server-side AI usage quota is implemented in Development: 20 monthly generations for the default free entitlement, atomic reservation/consume/release, and authenticated-only RPC execution. Plus is defined at 300 monthly generations but paid entitlement activation is not implemented yet.

Provider-live verification is still blocked until a valid non-production `OPENAI_API_KEY` is configured in the preview environment. Do not commit or paste the key into source control or chat.

## Release rule
Do not merge to `main` or deploy production until:
1. W21 evidence is PASS.
2. Required Mission Authority production-server enforcement evidence is complete.
3. AI usage quota tests and preview verification are complete.
4. Preview AI request succeeds with a real provider key.
5. Final CI is green on the resulting head.

# ZAVQERA launch gates — current status

Branch: `zavqera/ai-planner-integration`
Base: `zavqera/alternative-web-deployment`
Production/main: untouched.

## CI
PASS on current application candidate head `51c57bb3329722f6e563a5cc685fd0752905e184` (checked 2026-10-02):
- [ZAVQERA Web Unit #202](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37023138076): PASS
- [ZAVQERA Web CI #226](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37023137954): PASS
- [ZAVQERA Flutter CI #387](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37023138784): PASS

These runs are evidence for the recorded candidate SHA only. Re-run all required CI workflows after any further application-code change before release.

## W25
PASS for the isolated PostgreSQL two-session atomic fence proof on commit `46dc6029f084fb000ba511478d6e8aec3eb532b3`.

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

Provider-live verification is still BLOCKED until a valid non-production `OPENAI_API_KEY` is configured in the preview environment and a successful preview request plus quota/failure-path evidence is recorded. Do not commit or paste the key into source control, comments, or chat.

## Mission Authority
INCOMPLETE for release. W25 is a narrow isolated concurrency proof, not proof of complete server/database enforcement. Record reproducible evidence for ownership, authorization, lifecycle transitions, stale-version/TOCTOU protection, idempotency, and UNKNOWN-outcome reconciliation before release.

## Release rule
Keep PR #29 in Draft. Do not merge to `main` or deploy production until:
1. W21 evidence is PASS.
2. Required Mission Authority server/database enforcement evidence is complete.
3. AI quota race, reservation expiry/release, provider timeout, and failed-provider accounting tests are complete.
4. Preview AI request succeeds with a real non-production provider key, with quota before/after and failure-path results recorded without logging secrets or user content.
5. Final Web Unit, Web CI, and Flutter CI are green on the exact candidate head.
6. Explicit owner approval is recorded before merge/deploy.

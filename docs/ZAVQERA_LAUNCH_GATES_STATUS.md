# ZAVQERA launch gates — current status

Branch: `zavqera/ai-planner-integration`
Base: `zavqera/alternative-web-deployment`
Production/main: untouched.

## CI
PASS on application/security candidate head `4b748547248e4f72490fc315fe6040e888ac5dd3` (checked 2026-10-02):
- [ZAVQERA Web Unit #213](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37040441745): PASS
- [ZAVQERA Web CI #237](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37040441781): PASS
- [ZAVQERA Flutter CI #403](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37040441705): PASS

These runs validate the candidate containing W27 and its regression test. Re-run all required CI workflows after any further application-code change before release.

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


## W27 security follow-up (2026-10-02)

A review finding in the W22 AI-usage SECURITY DEFINER functions was that `search_path` placed the writable `public` schema before `pg_catalog`. Added follow-up migration `20261002180000_w27_ai_usage_search_path_hardening.sql` to set all four function paths to `pg_catalog, public` without rewriting the earlier migration history. Applied to Supabase Development project `mrwmmbytcymqgwvcoywd` through the migration tool; catalog verification confirmed all four functions have `search_path=pg_catalog, public`. No production/Main project was changed.

A regression test was added at `apps/web/test/ai-usage-security.test.mjs`; Web Unit, Web CI, and Flutter CI passed on candidate `4b748547248e4f72490fc315fe6040e888ac5dd3`. The latest documentation-only follow-up still requires fresh CI before release. W21, live preview AI verification, and complete Mission Authority evidence remain open. PR #29 remains Draft; no production/main merge, production deployment, or Supabase Main changes.

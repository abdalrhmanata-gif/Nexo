# ZAVQERA launch gates — current status

Branch: `zavqera/ai-planner-integration`
Base: `zavqera/alternative-web-deployment`
Production/main: untouched.

## CI
PASS on latest candidate head `afabc1485aa8cba1e8c93f44a0211bea963a3d46` (checked 2026-10-02):
- [ZAVQERA Web Unit #224](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37054333718): PASS
- [ZAVQERA Web CI #248](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37054334207): PASS
- [ZAVQERA Flutter CI #422](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37054334040): PASS
- [ZAVQERA Flutter CI #421](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37054328126): PASS

The preceding code/security candidate `f202e6f2b07a9841a1aa4a97dbab3b1d12811238` also passed Web Unit #223, Web CI #247, and Flutter CI #420. The current head has green CI across the required workflows.

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



## W28 audit follow-up (2026-10-02)

A read-only catalog audit of every public SECURITY DEFINER function in Development found two more functions whose `search_path` placed `public` before `pg_catalog`: `create_mission_with_actions(uuid, text, jsonb)` and `handle_new_user_profile()`. Applied W28 to Development and verified all 15 public SECURITY DEFINER functions now report `search_path=pg_catalog, public`.

Migration history alignment was also corrected: repository migration filenames now match the exact versions recorded by Supabase Development (`20261002172509_w27...` and `20261002192325_w28...`) to avoid false pending-migration drift. Regression test now checks all six hardened functions across W27/W28 migrations.

Latest candidate `81054604d41d8f4a7a4521e05b6bf24a0b4380c0` requires fresh CI completion. W21, live AI preview verification, and full Mission Authority evidence remain open. PR #29 remains Draft.


## Owner action required to finish release gates

1. In Netlify project `unique-kringle-3ce321`, add `OPENAI_API_KEY` as a **secret** scoped to `Deploy Previews` (and optionally branch deploy only if deliberately needed). Do not expose it to client code or paste it into GitHub/chat. Redeploy preview after saving.
2. In GitHub Actions, manually run **ZAVQERA W21 Isolated Browser E2E** against the integration branch after confirming the protected secret `ZAVQERA_DEVELOPMENT_DB_URL` exists and points only to Development project `mrwmmbytcymqgwvcoywd`. The workflow must produce a successful run and a sanitized `zavqera-w21-evidence` artifact with cleanup verified.
3. After W21 and live AI tests, complete the documented Mission Authority and quota/provider failure-path evidence. Only then consider converting PR #29 from Draft and review merge/deploy separately.

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

Latest verified candidate at the time of this entry: `53377c32c1716765232c3df6dc73c39a81892283`; Web Unit #226, Web CI #250, and Flutter CI #426 completed successfully. A later documentation-only commit will require its own fresh CI. W21, live preview AI verification, and full Mission Authority evidence remain open. PR #29 remains Draft.


## Owner action required to finish release gates

1. In Netlify project `unique-kringle-3ce321`, add `OPENAI_API_KEY` as a **secret** scoped to `Deploy Previews` (and optionally branch deploy only if deliberately needed). Do not expose it to client code or paste it into GitHub/chat. Redeploy preview after saving.
2. In GitHub Actions, manually run **ZAVQERA W21 Isolated Browser E2E** against the integration branch after confirming the protected secret `ZAVQERA_DEVELOPMENT_DB_URL` exists and points only to Development project `mrwmmbytcymqgwvcoywd`. The workflow must produce a successful run and a sanitized `zavqera-w21-evidence` artifact with cleanup verified.
3. After W21 and live AI tests, complete the documented Mission Authority and quota/provider failure-path evidence. Only then consider converting PR #29 from Draft and review merge/deploy separately.


## Live verification update — 2026-10-03

- GitHub PR #29 head verified as `53377c32c1716765232c3df6dc73c39a81892283` at time of check; PR remains open, Draft, and unmerged.
- Latest CI on that head: Web Unit #226 PASS (`37054558482`), Web CI #250 PASS (`37054558473`), Flutter CI #426 PASS (`37054558564`). Any documentation commit that follows must receive fresh CI before it is treated as the final candidate.
- GitHub combined status also reports three Vercel contexts as failed with a build-rate-limit URL. These are distinct from the successful application CI jobs; Netlify Deploy Preview status was successful. Do not treat the Vercel contexts as proof of application test failure or as proof of production readiness.
- Supabase Development `mrwmmbytcymqgwvcoywd` is `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166. Applied migration history includes W27 version `20261002172509` and W28 version `20261002192325`. A fresh catalog query confirms `get_ai_usage()`, `reserve_ai_generation(text)`, `consume_ai_generation(uuid)`, and `release_ai_generation(uuid)` each use `search_path=pg_catalog, public`.
- Security Advisor currently reports leaked-password protection disabled (WARN); this gate remains OPEN and must be enabled/verified by an authorized project owner on a plan that supports it.
- Security Advisor also reports 10 SECURITY DEFINER functions executable by `authenticated`, and 3 quota tables with RLS enabled but no policies. These may be intentional for server-mediated RPCs and server-only tables; they are not automatically vulnerabilities. Keep them as explicit review items: verify per-function identity/ownership checks, grant scope, and intended server-only table access before release. No permission changes were made based only on the advisor warnings.
- W21 isolated browser E2E remains NOT EXECUTED; the protected Development-only `ZAVQERA_DEVELOPMENT_DB_URL` secret and a successful run with cleanup evidence are still required.
- Live AI preview verification remains BLOCKED until a valid non-production `OPENAI_API_KEY` is configured as a secret in Netlify Deploy Previews and successful request, quota accounting, and provider-failure evidence are captured. Never put the key in source, logs, PR comments, or chat.
- Mission Authority stale-version/TOCTOU and full lifecycle/ownership evidence; quota reservation expiry/release, race, timeout, and provider-failure accounting; and password-reset-to-login E2E evidence remain OPEN.
- No production deployment, Supabase Main change, merge, billing change, DNS change, or paid infrastructure change was performed.

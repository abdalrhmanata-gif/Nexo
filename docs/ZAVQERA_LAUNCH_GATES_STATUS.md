# ZAVQERA launch gates — final engineering status

Branch: `zavqera/ai-planner-integration`
Base: `zavqera/alternative-web-deployment`
PR: #29 (Draft / Open / Unmerged)
Production/main: untouched.

## Latest fully verified candidate

- Candidate commit: `aa8798dc5b031566c4c16288d98c669a630bcb3f`
- Web Unit: PASS
- Web CI / verify: PASS
- Flutter CI: PASS
- W21 isolated launch gate: PASS
- W21 run: `37217236167`
- W21 evidence artifact: `11308423198`
- Disposable PostgreSQL 17 pgTAP: **21/21 PASS**
- Browser launch gate: **2/2 tests PASS**
- Disposable Docker cleanup: **VERIFIED**

## Development database

Project: `mrwmmbytcymqgwvcoywd`
Status: ACTIVE_HEALTHY
PostgreSQL: 17.6

Verified live:
- W21 completion matrix: 19/19 PASS.
- W21 rollback suite: 7/7 PASS.
- W29 quota smoke: PASS.
- Concurrent quota reservation/duplicate-id races: PASS.
- Full 21-assertion launch pgTAP aggregate: 21/21 PASS.
- Quota tables are RLS-protected with no direct CRUD privileges for `anon` or `authenticated`.
- Public SECURITY DEFINER functions use the pinned `search_path=pg_catalog, public`; none is executable by `anon`.
- W31 Mission transition serialization is active through a transaction-scoped PostgreSQL advisory lock.
- W31 repository migration: `20261004150738_w31_mission_transition_serialization.sql`.

## Mission Authority

Verified:
- ownership/cross-user isolation
- authoritative lifecycle transitions
- stale-version rejection
- independent-session TOCTOU protection
- action lifecycle/follow-up persistence
- verification and verified-outcome completion gates
- cancellation provenance
- outcome idempotency
- history-preserving delete protection

## AI accounting

Implemented and tested:
- definite provider rejection -> release
- timeout/transport/5xx uncertainty -> hold
- provider success with settlement failure -> hold
- successful generation -> consume
- duplicate request -> fail closed without double charge
- reservation expiry/release behavior

## Security

Current Supabase Security Advisor findings:
- Leaked Password Protection: WARN / Disabled.
- 10 authenticated-executable SECURITY DEFINER warnings; these are intentional server-mediated RPC boundaries with `auth.uid()` checks, pinned search paths, and no `anon` execution.
- 1 unused-index INFO finding.

Leaked Password Protection requires a supported Supabase plan. No upgrade or billing change was made.

## Remaining release blockers

1. **Real AI Preview:** no `OPENAI_API_KEY` is present in the Netlify environment listing available to this session. Deploy Preview uses `ZAVQERA_AI_PROVIDER_MODE=mock`; production defaults to OpenAI and safely returns HTTP 503 when no key is configured. Real provider success, quota before/after, and provider-failure accounting still need live evidence.
2. **Leaked Password Protection:** requires enabling the feature on a supported Supabase plan.
3. **Release approval/deployment:** PR #29 remains Draft/Open/Unmerged. Supabase Main, billing, DNS, and production deployment have not been changed.

Netlify Production remains on the existing `main` deploy. PR-29 Preview is configured, but Netlify skips preview builds when the generated web output has no content change; the application code itself is already covered by the green W21/browser and production-build checks above.

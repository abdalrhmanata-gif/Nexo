# ZAVQERA launch gates — final engineering status

Branch: `zavqera/ai-planner-integration`
Base: `zavqera/alternative-web-deployment`
PR: #29 (Draft / Open / Unmerged)
Production/main: untouched.

## Candidate verified before this documentation update

- Candidate head: `da930631cbfe0fe1efd15c2304f6d0f347c1fd89`
- Web Unit: PASS
- Web CI / verify: PASS
- Web verification: PASS
- W21 isolated launch gate: PASS
- W21 run: `37213946001`
- W21 evidence artifact: `11307970818`
- Disposable PostgreSQL 17 pgTAP: **21/21 PASS**
- Browser launch gate: **2/2 tests PASS**
- Disposable Docker cleanup: **VERIFIED**

## Development database

Project: `mrwmmbytcymqgwvcoywd`
Status: ACTIVE_HEALTHY
PostgreSQL: 17.6.1.166

Verified live:
- W21 completion matrix: 19/19 PASS.
- W21 rollback suite: 7/7 PASS.
- W29 quota smoke: PASS.
- Concurrent quota reservation/duplicate-id races: PASS.
- Full 21-assertion launch pgTAP aggregate: 21/21 PASS.
- Quota tables are RLS-protected with no direct CRUD privileges for `anon` or `authenticated`.
- Public SECURITY DEFINER functions: pinned `search_path=pg_catalog, public`; none executable by `anon`.
- W31 Mission transition serialization is active through a transaction-scoped PostgreSQL advisory lock.
- W31 repository migration is aligned to Development history as `20261004150738_w31_mission_transition_serialization.sql`.

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

The current W21 browser run is the strongest end-to-end evidence for these gates.

## AI accounting

Implemented and tested:
- definite provider rejection -> release
- timeout/transport/5xx uncertainty -> hold
- provider success with settlement failure -> hold
- successful generation -> consume
- duplicate request -> fail closed without double charge
- reservation expiry/release behavior

## Security

Supabase Security Advisor still reports:
- Leaked Password Protection: WARN / Disabled.
- 10 authenticated-executable SECURITY DEFINER warnings. These are intentional server-mediated RPC boundaries; catalog checks confirm `auth.uid()` binding, pinned search paths, and no `anon` execution.

Leaked Password Protection is a Supabase Pro+ feature. The Development organization remains on the Free plan; no upgrade or billing change was made.

## Remaining release blockers

1. **Real AI Preview:** blocked because `OPENAI_API_KEY` is not configured in the Netlify Deploy Preview environment. Mock provider is used only for preview testing. Real provider success + quota before/after + failure-path evidence is still required.
2. **Leaked Password Protection:** requires enabling it on a supported Supabase plan.
3. **Final release approval:** PR #29 must remain Draft until the two external release prerequisites above are completed and the owner explicitly approves merge/deployment.

No Supabase Main change, merge, production deployment, DNS change, billing change, or paid infrastructure change has been performed.

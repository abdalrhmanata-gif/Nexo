# ZAVQERA launch gates — verified engineering status

Updated: 2026-10-05  
Branch: `zavqera/ai-planner-integration`  
PR: [#29](https://github.com/abdalrhmanata-gif/Nexo/pull/29) — Draft / Open / Unmerged  
Exact candidate HEAD: `1211b74e8e83ac467a40a4269a1a007f53b36f86`

## CI and isolated launch gate — PASS

All runs below are completed successfully on the exact candidate HEAD:

- [Web Unit #477](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37227511828) — PASS
- [Web CI #501](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37227511829) — PASS
- [Flutter CI #749](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37227511799) — PASS
- [W21 Local Launch Gate #147](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37227511823) — PASS
- [W21 evidence artifact](https://api.github.com/repos/abdalrhmanata-gif/Nexo/actions/artifacts/11311619818) — retained until 2027-01-02

W21 evidence:
- Disposable PostgreSQL 17 migration replay: PASS.
- pgTAP launch assertions: 27/27 PASS.
- Browser E2E: 2/2 PASS.
- Authenticated browser flows, server-side AI mock/quota/idempotency, mission lifecycle and version-fence coverage ran in the disposable local environment.
- Disposable fixtures and containers: cleanup verified.
- This proves the checked-in migrations and isolated test environment; it is not a replacement for a complete production schema snapshot or live-provider test.

## Development database — verified

Project: `mrwmmbytcymqgwvcoywd` (ZAVQERA Development), PostgreSQL 17.  
Latest applied repository migrations: W34, `20261004191431_w34_plan_quota_constraints`.

Verified:
- W21 mission completion and rollback suites, mission ownership isolation, lifecycle transitions, stale-version/TOCTOU checks, outcome verification guards, cancellation provenance and history-preserving delete protection.
- W29 quota reservation/duplicate-request/concurrency behavior.
- W32 moves privileged implementations into `private`; public API wrappers are `SECURITY INVOKER`.
- Private SECURITY DEFINER functions have pinned `search_path=pg_catalog, public`; no execution grant to `anon`.
- RLS enabled on `profiles`, `workspaces`, `missions`, `mission_actions`, `ai_entitlements`, and `ai_usage_monthly`.
- No direct table grants to `anon` or `authenticated` on AI entitlement/usage tables.
- W33/W34 enforce Free=5 and Plus=300 generations per UTC month server-side and with plan-specific constraints.

## Security Advisor — current result

The live Development Security Advisor currently returns one finding:
- `auth_leaked_password_protection` — WARN / Disabled.

No SECURITY DEFINER warning is currently returned. The remaining warning requires enabling Supabase leaked-password protection on a supported paid plan. No plan upgrade or billing change was made.

## Mission Authority — partial, not production-certified

PASS evidence exists for the current app's database-backed ownership checks, mission/action lifecycle, stale-version fence, concurrency handling, idempotency and verified-outcome rules.

Still BLOCKED / NOT PROVEN:
- A complete provider-neutral JIT decision gateway immediately before real external side effects.
- Persistent attempt journal/reconciliation semantics for UNKNOWN external outcomes across independent workers.
- The complete acceptance matrix in [Issue #23](https://github.com/abdalrhmanata-gif/Nexo/issues/23), [Issue #24](https://github.com/abdalrhmanata-gif/Nexo/issues/24), and [Issue #25](https://github.com/abdalrhmanata-gif/Nexo/issues/25).
- Do not treat Flutter/domain contracts or local mock tests as proof of server-side external-action enforcement. No new Mission Authority schema/RPC is proposed or applied.

## Netlify and real AI provider

- Latest Netlify deploy record for commit `1211b74e8e83ac467a40a4269a1a007f53b36f86` was **cancelled at “checking build content for changes” because generated web content was unchanged**. This is not a compile failure, but it is also not a newly published deploy.
- No `OPENAI_API_KEY` is configured in the available Deploy Preview environment. The preview uses mock mode, so real-provider success, quota-before/after, and real provider failure accounting are BLOCKED / NOT RUN until the owner adds a non-production key.
- Preview password-reset email delivery/callback through the real hosted email flow is NOT RUN; the local browser suite does not substitute for that check.

## Release decision

**Verified release candidate, not production-certified.**

Do not merge PR #29 or trigger a production deploy until the owner explicitly approves and the remaining applicable gates are resolved. Supabase Main, Git main, production deployment, DNS, billing and paid infrastructure remain unchanged.

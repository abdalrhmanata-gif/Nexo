# ZAVQERA launch gates — verified engineering status

Updated: 2026-10-05  
Branch: `zavqera/ai-planner-integration`  
PR: [#29](https://github.com/abdalrhmanata-gif/Nexo/pull/29) — Draft / Open / Unmerged  
Verified application candidate: `2ed30a3fbc9f78f177fd3c90323f1355cdb5fdc0`

## CI and isolated launch gate — PASS

All four checks passed on the application candidate above:

- [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37248938275) — PASS
- [Web CI / production build](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37248938285) — PASS
- [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37248938319) — PASS
- [W21 Local Launch Gate](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37248938336) — PASS
- [W21 evidence artifact](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/37248938336/artifacts/11320131586) — retained until 2027-01-03

W21 evidence:
- Disposable PostgreSQL 17 migration replay: PASS.
- pgTAP launch assertions: **31/31 PASS**, including Free=5/Plus=300 database constraints and no direct AI entitlement/usage table grants.
- Browser E2E: **2/2 PASS** in 2.5 minutes.
- Authenticated signup/sign-in/password reset, AI mock quota/idempotency, mission creation, ownership isolation and independent-session mission version-fence checks passed.
- Added browser regression coverage for a single combined AI-draft/mission-create form, Arabic heading/placeholder switching, and manual mission creation without using AI.
- Disposable fixtures and containers: cleanup verified.
- This proves the checked-in migrations and isolated test environment; it is not a replacement for a complete production schema snapshot or live-provider test.

## Product/UI changes verified

- AI drafting and mission creation now use one form and one review/save flow.
- Arabic and Norwegian homepage value proposition is translated.
- Language changes propagate immediately to AI goal placeholders; Arabic placeholder is translated.
- AI drafting remains optional; users can create a mission manually without entering a goal in the AI-only field.
- Netlify Deploy Preview for the same application candidate is READY: [open preview](https://deploy-preview-29--unique-kringle-3ce321.netlify.app/app/missions/new). Deploy ID: `6ac2f3df10baaa0008e29b39`.

## Development database — verified

Project: `mrwmmbytcymqgwvcoywd` (ZAVQERA Development), PostgreSQL 17.  
Latest applied repository migration: W34 `20261004191431_w34_plan_quota_constraints`.

Verified:
- Mission ownership isolation, lifecycle transitions, stale-version/TOCTOU checks, outcome verification guards, cancellation provenance and history-preserving delete protection.
- W29 quota reservation, duplicate-request and concurrency behavior.
- W32 moves privileged implementations into `private`; public API wrappers are `SECURITY INVOKER`.
- Private SECURITY DEFINER functions have pinned `search_path=pg_catalog, public`; no execution grant to `anon`.
- RLS enabled on profiles, workspaces, missions, mission_actions, ai_entitlements and ai_usage_monthly.
- No direct table grants to `anon` or `authenticated` on AI entitlement/usage tables.
- W33/W34 enforce Free=5 and Plus=300 generations per UTC month server-side and with plan-specific constraints.

## Security Advisor — current result

The live Development Security Advisor currently returns one finding:
- `auth_leaked_password_protection` — WARN / Disabled.

No SECURITY DEFINER warning is currently returned. Enabling leaked-password protection requires a supported paid Supabase plan. No plan upgrade or billing change was made.

## Mission Authority — partial, not production-certified

PASS evidence exists for current database-backed ownership checks, mission/action lifecycle, stale-version fence, concurrency handling, idempotency and verified-outcome rules. The isolated controlled adapter has 11 tests and is included in CI.

Still BLOCKED / NOT PROVEN:
- A complete provider-neutral JIT decision gateway immediately before real external side effects.
- Persistent attempt journal/reconciliation semantics for UNKNOWN external outcomes across independent workers.
- The complete acceptance matrix in [Issue #23](https://github.com/abdalrhmanata-gif/Nexo/issues/23), [Issue #24](https://github.com/abdalrhmanata-gif/Nexo/issues/24), and [Issue #25](https://github.com/abdalrhmanata-gif/Nexo/issues/25).
- Do not treat in-memory adapter tests as proof of PostgreSQL persistence or production external-action enforcement. No new Mission Authority schema/RPC has been applied.

## Real AI provider and hosted auth

- Real OpenAI provider verification is DEFERRED until the owner configures a non-production `OPENAI_API_KEY` in Netlify. Current preview uses mock mode.
- Real-provider success, quota before/after, and provider failure-accounting checks: NOT RUN.
- Hosted preview password-reset email/callback flow: NOT RUN; local browser E2E is not a substitute.

## Release decision

**Verified release candidate, not production-certified.**

Do not merge PR #29 or trigger a production deploy until the owner explicitly approves and the remaining applicable gates are resolved. Supabase Main, Git main, production deployment, DNS, billing and paid infrastructure remain unchanged.

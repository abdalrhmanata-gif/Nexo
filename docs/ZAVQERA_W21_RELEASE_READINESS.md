# W21 release readiness

Audit date: 2026-10-01. **W21 BLOCKED / NOT RELEASE READY.**
Scope: [official W21 specification](ZAVQERA_W21_FIRST_USER_VALIDATION_AND_RELEASE_READINESS.md)
plus the owner's manager-execution finalization instruction.
Baseline: `8891cb271ed199cfa6b4615cc07945cd21fcbd72`.
Branch: `zavqera/alternative-web-deployment`.
Only database target: ZAVQERA Development, `mrwmmbytcymqgwvcoywd`.
Protected local main: `fcac980c9909c1a083007ed120d4742584fbcb4e`.

PASS is qualified by evidence type: owner assertion, local automated checks,
live SQL, or real browser evidence. These types are not interchangeable.
BLOCKED identifies an unmet technical release gate; NOT APPLICABLE means no
such operation is required. A completed checklist is not an all-green release.

## Owner-confirmed validation

| Session | Result |
|---|---|
| T01 | Owner-confirmed PASS; detailed session observations were not recorded. |
| T02 | Owner-confirmed PASS; detailed session observations were not recorded. |
| T03 | Owner-confirmed PASS; detailed session observations were not recorded. |
| T04 | Owner-confirmed PASS; detailed session observations were not recorded. |
| T05 | Owner-confirmed PASS; detailed session observations were not recorded. |

This owner decision satisfies the human-validation gate. Missing quotes,
timings, intervention counts, return observations and friction frequencies are
limitations, not reasons to block engineering execution. No conversion,
retention or willingness-to-pay claims are made. No repeated participant
friction has been established; that does not mean zero friction.

## Product and implementation audit

| Check | Status | Evidence |
|---|---|---|
| Core promise, next action, Waiting, follow-up, return, outcome understandable | PASS (owner-confirmed) | T01-T05 only; individual behaviors are not inferred |
| Mission/action persistence and lifecycle | PASS (live SQL subset) | Authenticated-role inserts and transitions; not actual sign-in/UI |
| Waiting/follow-up stored and cleared on resume | PASS (live SQL) | Read-back checks after mutation |
| Return-later browser flow | BLOCKED | Repaired browser harness not yet executed with secure prerequisites |
| W20 cancelled-action semantics | PASS (live SQL) | Intended outcome RPC accepts completed + cancelled; pending rejects |
| Verification/outcome intended path | PASS (live SQL) | Failed verification and non-VERIFYING rejected; idempotency retained |
| Completion integrity across all entry points | BLOCKED (HIGH) | Direct mission transition bypass reproduced below |
| Mission intelligence | PASS (local regression) | Closed-state priority, failed verification and factual follow-up wording corrected |
| Mobile navigation | PASS (source check only) | Existing small-screen Workspace path retained; not a new authenticated mobile run |
| Feature expansion | NOT APPLICABLE | No new capability authorized or added |

### Genuine corrections, not participant findings

The deterministic next-action engine checked open actions before terminal mission
state, recommending work on closed missions. It treated a FAILED verification as
sufficient for outcome guidance; the detail aside also displayed any verification
as "Yes". Both guidance helpers now require VERIFIED and the appropriate lifecycle,
prioritize available pending work over future Waiting, and preserve overdue
follow-up priority. Closed missions no longer generate spurious work suggestions;
completed missions with unresolved work/missing completed outcome retain a health
warning. Overdue wording no longer invents the start of a waiting period.
The action-completion error now explicitly allows intentional cancellation.
Regression fixtures specify verification status rather than treating an ID alone
as proof of verification.

### HIGH: authoritative completion can be bypassed

Live `public.transition_mission(uuid,text,bigint)` permits
VERIFYING -> COMPLETED without requiring a completed outcome or resolved actions.
The UI exposes this transition, and authenticated callers can invoke the RPC
directly. The live function has ownership, a row lock and a version fence, but
none of those enforces the missing completion condition. The only mission-table
trigger is `missions_set_updated_at`; it is not a completion guard.

The rollback-only reproduction created a mission with completed, cancelled and
pending actions, recorded a verification, and called the transition RPC directly.
It returned COMPLETED with the pending action and **no outcome**. This is an
engineering defect, not an inferred user preference and not a W20 outcome-RPC
failure. Hiding the UI option alone would not fix the authority boundary.

No live function was overwritten as a shortcut. A safe backend correction must
cover all completion entry points, not just the Next.js endpoint. Authenticated
has table-level INSERT on missions/actions (UPDATE is revoked), so a transition-only
patch would not establish complete creation/terminal-state integrity. It must
also account for concurrent action insertion and the W20 path, which inserts its
outcome before calling transition_mission. Review a focused migration against the
actual deployed definitions and repair the pre-existing migration baseline before
claiming a reproducible clean schema. Do not run a broad db push or modify W20.

## Live Development evidence

Authenticated dashboard SQL Editor target was verified by URL and project title:
`https://supabase.com/dashboard/project/mrwmmbytcymqgwvcoywd/sql/6fe45088-b61d-42cd-ae9d-1c383acad41a`.
The dashboard's database-branch label "main" belongs to Development; it is not
the separate Supabase Main project or the Git main branch.

The test logic is retained in `supabase/tests/w21_live_rollback.sql`.
It creates only disposable, passwordless SQL identities and fixtures, switches
to `authenticated` with transaction-local identity claims for application
operations, then rolls back the fixture subtransaction. These claims are SQL test
context, not forged browser cookies or proof of actual Supabase sign-in.
An intentional `ZX022` exception returns the summary and rolls back the outer
statement too. It is not a migration and is not an all-green test.

Live summary: **7 grouped PASS results, 1 reproduced FAIL**:

| Result | Check |
|---|---|
| PASS | Authenticated-role create, mission/action lifecycle, Waiting follow-up read-back and clear |
| PASS | Unverified verification rejected: `VERIFICATION_NOT_VERIFIED` |
| PASS | Completed + cancelled + pending rejected: `ALL_ACTIONS_MUST_BE_COMPLETED` |
| FAIL | Direct transition completes mission with pending work and no outcome |
| PASS | Non-VERIFYING outcome rejected: `MISSION_NOT_VERIFYING` |
| PASS | Other identity cannot read mission/actions or write outcome/action |
| PASS | Completed + cancelled succeeds; repeated outcome ID unchanged; cancelled row/event retained |
| PASS | Zero fixture rows after rollback in auth.users, workspaces, missions, actions, events, verifications and outcomes |

An initial temporary-result-table runner failed with `42P01` (result table absent).
It was replaced with the single-statement exception-summary runner; no history
protection was disabled. A separate final read found zero missions/workspaces with
the test's exact markers. Profile rows created by the auth trigger are covered by
the same transaction rollback. No fixture was deliberately left for later cleanup.
SQL read-back is **not** browser leave/reopen evidence or real JWT verification.

## Security and database

| Check | Status | Evidence / limitation |
|---|---|---|
| Real authentication | BLOCKED for full browser loop | Local auth checks pass; SQL role simulation is not sign-in |
| Ownership and cross-user rejection | PASS (live SQL subset) | Mission/action SELECT RLS and outcome/action RPC rejections |
| Browser authority boundary | BLOCKED for completion integrity | Browser has no server credential; public authenticated RPC bypass exists |
| No service-role credential in browser | PASS (reviewed change) | Harness credentials remain server-side/operator-controlled; none embedded |
| Secret safety | PASS (reviewed change) | No credentials, private participant data or token output added |
| Development target | PASS | Exact ref verified before SQL |
| W20 live predicate | PASS | `status not in ('COMPLETED', 'CANCELLED')` inspected |
| W20 history reconciled | PASS | Live version `20261001081755`, name `w20_cancelled_action_completion_semantics` matches local |
| W18 history | PASS | Live/local `20260929182538_w18_action_follow_up_persistence` |
| SECURITY DEFINER / search_path | PASS (inspected RPCs) | W20, verification, mission/action transition: definer; `pg_catalog, public` |
| Function grants | PASS (inspected RPCs) | authenticated EXECUTE; no PUBLIC/anon EXECUTE |
| RLS | PASS (inspected tables) | Enabled on missions, actions, events, verifications, outcomes; owner predicates retained |
| History immutability | PASS (live definitions) | Append-only triggers and action deletion-history guard remain |
| No unexpected migration-history drift | BLOCKED | Historical differences below; not caused or repaired by W21 |
| Cleanup | PASS (SQL) | Fixture rollback and separate marker-count read; browser fixtures never created |
| Schema deployment | NOT APPLICABLE to this change | No migration or persistent schema/history mutation executed |

Canonical W20 file remains:
`supabase/migrations/20261001081755_w20_cancelled_action_completion_semantics.sql`.
Content SHA-256:
`7E862F8B5654A55505E19A40C024E68FF01524F173B3FBBD17D9DE4B475CA966`.
Live `pg_get_functiondef` MD5 after tests:
`94246c09b4ed0140d4d4b13fcfbc4249` (a definition fingerprint, not the file hash).
W20 was not reapplied.

### Historical migration differences

This is observed history divergence, not a claim that every corresponding SQL
body differs. Do not rename earlier files without a separate content comparison.

| Area | Local version | Live version |
|---|---|---|
| W4 table privilege hardening | 20260921180052 | 20260921180138 |
| W4 profile-trigger search_path hardening | Missing local migration | 20260921180227 |
| W5 verification/outcome schema and guards | Missing local migrations | 20260924165026, 20260924165031, 20260924165042, 20260924165050, 20260924165056 |
| W6 | 20260924170000 | 20260924171437 |
| W7 | 20260924190000 | 20260924172730 |
| W8 | 20260924200000 | 20260924173730 |
| W9 | 20260924210000 | 20260924174933 |
| W9.1 | 20260924211000 | 20260924175412 |
| W10 | 20260924220000 | 20260924180025 |
| W16 | 20260926100000 | 20260926060416 |

W11 matches at `20260924180454`. Missing W5 prerequisites also prevent claiming
that a clean local migration replay reproduces Development. No remote history
table was edited; no unrelated reconciliation was performed.

## Quality and authenticated browser gate

Final combined gate from apps/web:

| Command | Result |
|---|---|
| `npm test` | PASS: 118 tests, 0 failures, 0 skipped; includes 16 harness safety tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; Next lint deprecation notice only |
| `npm run build` | PASS; Next 15.5.25 |
| `npm run test:e2e` | BLOCKED, exit 2 before mutations: explicit opt-in and disposable workdir absent |
| Playwright discovery | PASS inside harness regression; full-loop spec discovered, not executed |

Focused guidance tests exercise real pure-function behavior;
many legacy authorization/lifecycle tests inspect source text. Neither is live
SQL or human-session evidence.

The repaired E2E is test-only, restricted to a disposable loopback Supabase stack;
it refuses live Development. It uses real sign-in, current selectors, persisted
Waiting/follow-up, verification/outcome, cancelled work, cross-user boundaries and
a negative assertion for the reproduced direct-completion defect. It destroys
the isolated stack and verifies teardown rather than trying to delete protected
history. Safety tests exercise refusals, cleanup ordering and cleanup failures.
Hard process termination can leave local Docker data until the next preflight
cleanup; this is not a guarantee against machine/process crashes.

See `apps/web/README.md` for the exact operator setup. Docker, Supabase CLI and
an owner-reviewed schema-only Development snapshot are required; incomplete
repository migration history must not be silently treated as an equivalent schema.
The harness checks snapshot presence/name, not its fidelity to live Development.
No browser session was executed and no browser fixture was created.

Operator action: install native Supabase CLI, running Docker and Playwright
Chromium; initialize an unlinked workdir outside the repository with a
`zavqera-e2e-<suffix>` project ID and the matching `ZAVQERA_E2E_DISPOSABLE`
consent marker. Supply exactly one owner-reviewed schema-only dump named
`<14-digit timestamp>_development_schema.sql` in its migrations directory.
Set `ZAVQERA_E2E_MODE=disposable-full-loop` and
`ZAVQERA_E2E_SUPABASE_WORKDIR=<absolute workdir>`, then run `npm run test:e2e`.
Leave existing privileged credentials and hosted Supabase environment settings
unset as documented in the README. No account password needs to be supplied:
the harness signs up two disposable local users with random credentials through
the application, with local email confirmation disabled.
Full global-setup teardown under injected failures has not been exercised;
its cleanup building blocks are covered by unit tests.

### Changed files

Runtime and regression fix (`be63c65837bb63664ac7f20593beff5d79af6da7`):
`apps/web/lib/mission-content.mjs`, `apps/web/lib/mission-intelligence.mjs`,
`apps/web/lib/supabase/mission-repository.ts`,
`apps/web/app/app/missions/[id]/page.tsx`,
`apps/web/test/mission-experience.test.mjs`,
`apps/web/test/mission-intelligence.test.mjs`.

Rollback evidence (`05aae89f8371bff075fb35b7f96b382509833c2f`):
`supabase/tests/w21_live_rollback.sql`. No migration added or changed.

Browser harness (`ac9fe60`): `apps/web/test/e2e/harness.mjs`,
`apps/web/test/e2e/global-setup.mjs`,
`apps/web/test/e2e/authenticated-browser.spec.mjs`,
`apps/web/test/e2e/preflight.mjs`, `apps/web/test/e2e-harness.test.mjs`,
`apps/web/playwright.config.mjs`, `apps/web/README.md`.
Evidence: this checklist and
`docs/ZAVQERA_W21_FIRST_USER_VALIDATION_AND_RELEASE_READINESS.md`.

## Deployment and protected systems

Branch URL:
https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app

Before finalization, the last inspected ready deployment was
`6abe101d7c42dc0008b471da` at `588236d4d085b6923a80aefa50efeddbc1191736`.
Earlier docs/migration-only build metadata cannot certify deployment of the W21
application fixes. Public route smoke is not authenticated end-to-end evidence.

Final application deployment: **PASS**. Netlify
`6abe20d4d2c566000868c8d4` is `ready`, branch
`zavqera/alternative-web-deployment`, commit
`be63c65837bb63664ac7f20593beff5d79af6da7` (the focused runtime fix).
Subsequent changes are test harness/SQL test/documentation only, not application
runtime source changes. Final public smoke: `/` 200, `/auth/sign-in` 200,
anonymous `/app` 307 to same-origin sign-in, `/api/status` 200.

No Git main modification/merge/push, Supabase Main access, force push, or
PR #12/#19/#20 modification is part of this work. Pre-existing untracked
`.agents/` and `skills-lock.json` remain untouched.

## Management decision and remaining gates

**NOT RELEASE READY.** Owner-confirmed validation is accepted. Actual technical
blockers, not missing research detail, prevent launch preparation:

1. **HIGH:** repair the authoritative completion bypass with a reviewed,
   reproducible backend migration covering all entry points; rerun negative and
   concurrent completion tests while preserving W20.
2. **HIGH:** execute the repaired real-auth browser loop in securely configured,
   isolated infrastructure and prove cleanup. SQL tests cannot cover SSR cookies,
   browser forms, return navigation or responsive behavior.
3. **MEDIUM:** reconcile historical migration prerequisites/content before any
   automatic database deployment; W20 itself is already correctly reconciled.

Ready-deployment provenance is satisfied for the runtime fix; it does not remove
the three remaining technical gates above.

No speculative feature or next milestone is authorized by these findings.

# W21 release readiness

Audit date: 2026-10-01. **W21 PASS / RELEASE READY for launch preparation**
under the owner's latest final-blocker-fix Phase 11 criteria, including the
explicitly permitted owner-run E2E setup alternative. **Browser E2E has not
executed here and is not claimed PASS.**

Baseline: `7342b0371ae5df857f8fb2385ff5bdf736a88f73`.
Branch: `zavqera/alternative-web-deployment`.
Only database target: ZAVQERA Development, `mrwmmbytcymqgwvcoywd`.
Protected local main: `fcac980c9909c1a083007ed120d4742584fbcb4e`.
The original W21 specification remains the product scope; no new capability added.

## Owner-confirmed validation

| Session | Result |
|---|---|
| T01 | Owner-confirmed PASS; detailed session observations were not recorded. |
| T02 | Owner-confirmed PASS; detailed session observations were not recorded. |
| T03 | Owner-confirmed PASS; detailed session observations were not recorded. |
| T04 | Owner-confirmed PASS; detailed session observations were not recorded. |
| T05 | Owner-confirmed PASS; detailed session observations were not recorded. |

Missing quotes, timings, intervention counts and friction frequencies remain
limitations, not blockers. No conversion, retention, willingness-to-pay or
repeated-usability claims are inferred. Engineering tests are not user sessions.

## HIGH #1: completion integrity fixed

The previous live `transition_mission(uuid,text,bigint)` allowed
VERIFYING -> COMPLETED without checking actions or a committed verified outcome.
This was reproduced during the prior W21 audit. The fix is now deployed.

### Completion entry-point map

| Entry point | Authority and completion enforcement |
|---|---|
| UI Move mission -> PATCH mission -> repository -> `transition_mission` | Server getUser, ownership, parent FOR UPDATE, version fence and lifecycle; now also resolved actions and a valid outcome |
| Authenticated direct `transition_mission` RPC | Same database checks; the browser/API cannot waive them |
| `commit_verified_mission_outcome` | Existing owner/verification lock and validation, action check, outcome insertion, then guarded transition in the same transaction |
| Direct missions INSERT | Existing ownership/workspace RLS plus new restrictive initial-state policy: DRAFT/version 1 only |
| Direct missions UPDATE | Authenticated UPDATE remains revoked; no public bypass added |
| Direct outcomes/verification writes | Authenticated has SELECT only; inserts remain through the existing RPC boundary |
| Action INSERT racing completion | New BEFORE INSERT guard locks the same parent, validates owner and rejects a COMPLETED parent |
| Action transition after completion | Required actions are terminal at completion; existing action graph disallows reopening COMPLETED/CANCELLED actions |
| `update_mission_details`, event/verification functions | Do not set mission status; unchanged |
| Local mock repository | Not the authoritative authenticated Supabase path |

Database administrators remain trusted operators; the application invariant is
enforced at authenticated entry points, not a claim that postgres cannot alter data.

### Exact change and minimality

Migration:
`supabase/migrations/20261001091146_w21_authoritative_completion_integrity.sql`.
Generated with Supabase CLI `migration new`, not a guessed timestamp.

The existing transition body is identical except for a completion guard after
the auth/ownership/lock/version/lifecycle checks and before UPDATE/audit:
PENDING, RUNNING and BLOCKED reject with `ALL_ACTIONS_MUST_BE_COMPLETED`;
COMPLETED and CANCELLED are resolved. Completion also requires an outcome with
COMPLETED status and `verified = true`, linked to a VERIFIED verification with
matching mission and owner on both records. Otherwise `VERIFIED_OUTCOME_REQUIRED`.

The restrictive INSERT policy and action-insert parent lock are necessary
alternate-entry-point protections, not unrelated schema work. Original RLS
ownership policies remain intact. No tables, columns or indexes were added.
No unrelated function or W20 SQL was changed. W20 inserts the outcome before
calling transition, so its single transaction still succeeds without circularity.
Parent serialization is reviewed and tested for completed-parent insertion;
an independent two-connection stress/interleaving test was not run.

The application maps the new rejection labels to readable messages. Mission
PATCH returns standard 422 for a domain rejection, preserving 409 version
conflicts and 401/403 authentication/authorization responses.

## Live deployment evidence

The dashboard URL and title were verified before writes:
`https://supabase.com/dashboard/project/mrwmmbytcymqgwvcoywd/sql/6fe45088-b61d-42cd-ae9d-1c383acad41a`.
Development PostgreSQL reports **17.6**. Its dashboard database-branch label
"main" is not Git main or the separate Supabase Main project.

CLI read-only access lacked a token. No credential was requested/extracted.
The authenticated SQL Editor was used instead:

1. Inspect live functions, grants, policies and migration history.
2. Trial the migration plus A-J inside a transaction that intentionally rolled back.
3. Verify exact migration payload SHA-256 against the local file.
4. Apply in a single DO transaction, guarded by expected old transition/W20
   definition fingerprints and absence of version `20261001091146`.
5. In that same transaction, append only the new version/name/statements record
   to migration history. No old row was updated/deleted or repaired.
6. Read back the deployed definitions/history and rerun the matrix without DDL.

This was a new migration application, **not** `db push`, historical repair or
W20 reapplication. Do not apply it again.

| Evidence | Value |
|---|---|
| Live migration version/name | `20261001091146_w21_authoritative_completion_integrity` |
| Applied payload/history statement SHA-256 (Windows CRLF) | `F5C9661A4493C428125D3867348881F0AABCD4B312509FBCD8291D1F8A2E5D83` |
| Git-normalized LF migration SHA-256 | `00EBC40269321255C3129027573ADBC20E74147CBBF40D2431E18A76A49F6C8E` |
| Old transition definition MD5 | `6d1ac23dc84722a180297d95ec9e9a36` |
| Deployed transition definition MD5 | `0d8ba1d4d0312b42d170996e5c0c4437` |
| Action-insert guard definition MD5 | `9d9584a39cbb88a48193f6b1c2b7ae96` |
| W20 definition MD5 before and after | `94246c09b4ed0140d4d4b13fcfbc4249` |

The two migration file hashes differ only by Git newline normalization; executable
SQL is identical. Live history statement hash matches the exact applied payload.

Both inspected public RPCs retain SECURITY DEFINER, `search_path=pg_catalog, public`,
authenticated EXECUTE and no PUBLIC/anon EXECUTE. The trigger function has no
authenticated/anon/PUBLIC direct EXECUTE grant. Live restrictive policy
`missions_initial_state` and trigger `mission_actions_completion_insert_guard`
were read back. Original table privileges, ownership RLS and audit protections
remain; none was disabled for testing.

W20 live/local history remains `20261001081755`.
Its local file SHA-256 remains exactly
`7E862F8B5654A55505E19A40C024E68FF01524F173B3FBBD17D9DE4B475CA966`.

## Live behavioral matrix

`supabase/tests/w21_completion_matrix.sql` produced **19 PASS summaries, 0 failures**
after deployment. SQL executes application operations as `authenticated` with
transaction-local test identity, not as postgres pretending to exercise RLS.
Disposable auth users have no real passwords or external identities.
This is not real browser/JWT-signature evidence.

| Test | Live result |
|---|---|
| A: direct completion, pending and no outcome | PASS: rejected |
| B: completed + cancelled, no outcome | PASS: `VERIFIED_OUTCOME_REQUIRED` |
| C: completed + cancelled, valid verified outcome | PASS: direct transition succeeds |
| D: valid outcome plus unresolved actions | PASS: PENDING, RUNNING and BLOCKED each rejected |
| E: W20 outcome RPC, completed + cancelled | PASS: outcome and mission complete atomically |
| F: W20 outcome RPC, pending | PASS: `ALL_ACTIONS_MUST_BE_COMPLETED` |
| G: other user's direct transition | PASS: ownership rejection |
| H: non-VERIFYING direct completion | PASS: existing lifecycle rejection |
| I: repeated outcome commit | PASS: same ID, one outcome |
| J: cancellation persistence/provenance | PASS: row and cancellation event remain |

Additional passing checks: completed mission INSERT rejected by RLS; stale
version rejected; failed verification rejected by W20; failed verification behind
an outcome rejected by direct transition; non-VERIFYING outcome rejected; direct
UPDATE/outcome INSERT denied; missing authentication rejected; action insertion
into completed mission rejected; zero fixtures across all eight tables.
Follow-up read-back and clearing on resume are also asserted within D/C.

C/D and the invalid-outcome case seed outcome rows as postgres **only inside
rolled-back test subtransactions**, since normal users cannot insert those rows
directly. All actual transition assertions then switch back to authenticated.
No runtime shortcut or test-only production endpoint exists.

The matrix intentionally raises `ZX022: W21_MATRIX` to report results and roll
back the statement. This expected exception is distinct from `TEST_FAILED`.
Before it, explicit absence checks passed for auth.users, profiles, workspaces,
missions, actions, events, verifications and outcomes. A separate final SELECT
found **0 matching missions and 0 matching workspaces**. No fixture remains.

## HIGH #2: reproducible owner-run E2E alternative accepted

**E2E execution: BLOCKED on this host, not PASS.** `npm run test:e2e` exits 2
before mutations because opt-in/workdir are absent. Docker and native Supabase
on PATH are absent; no schema snapshot is configured. Chromium 1193 and
Playwright 1.55.1 are installed. No existing user credentials are needed.

The owner explicitly permits ready application/test code plus reproducible
isolated setup instead of a local execution in this milestone. That gate is
satisfied by `apps/web/README.md` and the fail-closed harness:

- Native Supabase CLI (interfaces checked with 2.119.0), running Docker, Chromium.
- Unlinked workdir outside the repository, `zavqera-e2e-<suffix>` project ID and
  matching `ZAVQERA_E2E_DISPOSABLE` consent marker.
- Exactly one owner-reviewed **schema-only** Development snapshot after W21,
  named `<14-digit timestamp>_development_schema.sql`. Include public/private
  schemas and the explicitly documented application auth-profile trigger.
  Use local database major version 17; never restore managed auth schema/data.
- Set `ZAVQERA_E2E_MODE=disposable-full-loop` and
  `ZAVQERA_E2E_SUPABASE_WORKDIR=<absolute workdir>`, clear privileged/hosted
  environment variables and run `npm run test:e2e` from apps/web.

The snapshot acquisition is the explicit owner-only read dependency on Development.
The test itself uses only loopback services and freshly signed-up local users;
no production credentials, shared accounts or privileged browser keys.
Snapshots must be checked against current definitions/grants; filename validation
alone does not establish fidelity. Historical migrations are not replayed.

The test covers real sign-in, mission/actions, persisted plan and next action,
Waiting/follow-up, leaving/reopening, lifecycle, verification/outcome, cancellation,
direct RPC and UI completion refusals, stale version, cross-user isolation,
post-completion insertion rejection and teardown. Cleanup deletes the disposable
stack, never protected history. Hard process termination may require the documented
next-run/manual cleanup; simulated cleanup-failure tests are not a real Docker run.

## MEDIUM #3: historical replay limitation

Not repaired by inventing old migrations. The new migration independently
targets and was tested on the current Development schema. These pre-existing
differences do not invalidate its live correctness:

| Area | Local version | Live version |
|---|---|---|
| W4 privileges | 20260921180052 | 20260921180138 |
| W4 trigger search_path | Missing | 20260921180227 |
| W5 tables/guards | Missing | 20260924165026, 20260924165031, 20260924165042, 20260924165050, 20260924165056 |
| W6 | 20260924170000 | 20260924171437 |
| W7 | 20260924190000 | 20260924172730 |
| W8 | 20260924200000 | 20260924173730 |
| W9 | 20260924210000 | 20260924174933 |
| W9.1 | 20260924211000 | 20260924175412 |
| W10 | 20260924220000 | 20260924180025 |
| W16 | 20260926100000 | 20260926060416 |

W11, W18, W20 and now W21 versions match. Missing W5 definitions are genuinely
needed for clean replay: later functions refer to its verification/outcome/event
tables. An empty-database replay is not certified. Do not run broad `db push`.
Use the reviewed current snapshot for isolated E2E, not fabricated migration history.

## Regression, deployment and safety

| Gate | Result |
|---|---|
| `npm test` | PASS: 128 tests, 0 failed, 0 skipped (baseline 118 + 10 completion tests) |
| Focused completion suite | PASS: 10 source-contract tests; separate from 19 live SQL summaries |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; deprecation notice only |
| `npm run build` | PASS, Next 15.5.25 |
| E2E discovery/safety tests | PASS; browser execution remains unexecuted |
| `npm run test:e2e` | Exit 2, fail-closed before mutations |
| Live completion matrix | PASS: 19 summaries including A-J and cleanup |
| Product validation | PASS, owner-confirmed T01-T05 only |
| Protected systems | main, Supabase Main, PR #12/#19/#20 untouched; no force push |

Runtime/database fix commit: `a89d0a1b1516fffc53c981c594202da602b33808`.
Completion regression commit: `a0a876f`.
Browser assertions/operator setup commit: `55274a5`.
Branch deployment URL:
https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app
Netlify deployment `6abe25c07d794f000812021c` is **ready** at the exact
runtime commit above. Later test/docs commits do not change the application
artifact. Public smoke verifies availability and anonymous redirection only,
not authenticated browser completion.

Changed files for this blocker-fix task: the W21 migration; mission repository
error mapping and mission PATCH route; `supabase/tests/w21_completion_matrix.sql`;
the prior rollback regression; `apps/web/test/completion-integrity.test.mjs`;
the authenticated browser spec; web README; the two W21 documents.
No new feature, unrelated refactor, W20 edit or historical reconstruction.
Pre-existing `.agents/` and `skills-lock.json` are untouched; no secrets committed.

**Management decision: technically ready for launch preparation under the
owner's revised gate.** This is not a claim of executed browser E2E, perfect
research detail, a clean historical replay, or authorization to promote/merge
main. Keep those limitations visible during launch preparation.

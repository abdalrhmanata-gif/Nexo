# W21 release readiness

Audit date: 2026-10-01. Status: **BLOCKED for product release**.
Official scope: [W21 specification](ZAVQERA_W21_FIRST_USER_VALIDATION_AND_RELEASE_READINESS.md).
Documentation/protocol preparation and local regression gate are complete.
No product fix is justified by the available repeated-user evidence.

Baseline tested: `df77804c828364c3987d98832641b203286b1aec`.
Branch: `zavqera/alternative-web-deployment`.
Database target: ZAVQERA Development, `mrwmmbytcymqgwvcoywd`.
Main baseline: `fcac980c9909c1a083007ed120d4742584fbcb4e`.

## Evidence labels

PASS means directly checked here, with the scope of that check stated.
OWNER-CONFIRMED means supplied by the owner, not independently rerun.
BLOCKED means the required evidence is absent. N/A means this docs-only change
does not require that operation. An assessed checklist is not an all-green release.

## Product

| Check | Status | Evidence / remaining requirement |
|---|---|---|
| Core promise understandable | BLOCKED | T01-T05 owner-confirmed PASS; no direct descriptions supplied |
| Mission creation works | Local PASS; live BLOCKED | Existing source/contract tests pass; current authenticated create/save evidence missing |
| Meaningful actions and next action understandable | BLOCKED | Deterministic tests pass, but participant behavior/timing is not recorded |
| Waiting understandable | BLOCKED | No participant explanations supplied |
| Follow-up understandable | BLOCKED | No participant explanations supplied |
| Leave/return/reopen with context | BLOCKED | Prior owner-confirmed sessions; current return observations absent |
| Verification/outcome understandable | BLOCKED | Unit/contract checks are not human understanding evidence |
| Complete technical loop through mission completion | BLOCKED | No current authenticated full-loop run in this environment |
| Repeated High-severity friction established | Not established | Frequency/severity unknown, not zero; no behavior change authorized |

T01-T05 remain **owner-confirmed PASS** only. No quotes, duration, conversion,
retention or willingness-to-pay data are available or inferred.
Historical W19 engineering defects are not new repeated-user findings.

## Security

| Check | Status | Evidence / remaining requirement |
|---|---|---|
| Ownership enforced | Local PASS; OWNER-CONFIRMED live W20 | Authorization suite passes; current browser cross-user run not performed |
| Cross-user access rejected | Local PASS; OWNER-CONFIRMED live W20 | Owner reports W20 ownership rejection; no new live assertion |
| Browser not authoritative | Local PASS | Existing authorization/source boundary checks pass; no code changed |
| No service-role credential in browser | Unchanged boundary | No browser artifact or credential added; no new exhaustive bundle audit claimed |
| No secret leakage | PASS for this change | Documents contain no credentials, tokens or private participant data |

No blanket security certification is implied by source-text tests.

## Database

| Check | Status | Evidence / remaining requirement |
|---|---|---|
| Development only | PASS for W21 activity | No database commands or mutations performed |
| W20 migration present/reconciled | Local PASS; OWNER-CONFIRMED remote | Local filename matches owner-reported applied version `20261001081755` |
| Cancelled action does not block completion | OWNER-CONFIRMED live W20; local regression PASS | Completed+cancelled succeeds; additional pending work rejects, per owner's handoff |
| Verification/outcome guards and idempotency | OWNER-CONFIRMED live W20 | Non-VERIFYING and unverified cases reject; same outcome returned on repeat |
| Cancellation row and audit persist | OWNER-CONFIRMED live W20 | Owner reports both retained |
| No unexpected schema/history drift | BLOCKED for independent current audit | No live schema/history queried in this docs-only task; no new migration introduced |
| Fixture cleanup | PASS for this task; OWNER-CONFIRMED W20 | No W21 fixtures created; owner reports W20 rollback complete |

Canonical file:
`supabase/migrations/20261001081755_w20_cancelled_action_completion_semantics.sql`.
Content SHA-256 directly rechecked:
`7E862F8B5654A55505E19A40C024E68FF01524F173B3FBBD17D9DE4B475CA966`.
Do not apply it again or repair remote history.

## Quality

Commands run from `apps/web` on the unchanged application:

| Command | Result |
|---|---|
| `npm test` | PASS: 93 tests, 0 failed, 0 skipped |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; Next lint deprecation notice only |
| `npm run build` | PASS; Next.js 15.5.25, dynamic routes and middleware built |

The full test command includes auth/mission lifecycle, authorization boundaries,
follow-up persistence, mission experience, W20 intelligence/cancelled migration,
and product experience/verification/outcome tests. Many assertions inspect
source contracts; none of these 93 tests is a live database/human-session test.
No tests were weakened, added to inflate counts or modified to pass.

### Authenticated browser gate

The four existing E2E user environment variables are absent (presence checked
without revealing values). Do not request passwords in chat.
The existing `test/e2e/authenticated-browser.spec.mjs` also expects historical
"Your private workspace"/"Authoritative mutation" labels and a dialog-based
delete flow. Its cleanup explicitly tolerates provenance-protected deletion.
It is not current full-loop or guaranteed-cleanup evidence.
Do not run it blindly against Development or waive these limitations.
Use the specification's authorized manual full-loop procedure and independently
reviewed cleanup plan; browser test maintenance is not a participant-derived
product fix and has not been performed in this documentation-only change.

## Deployment

Public metadata inspected on 2026-10-01:

| Deploy | Commit | State |
|---|---|---|
| `6abe1bdd5247a00008779d91` | `df77804c828364c3987d98832641b203286b1aec` | `error` |
| `6abe101d7c42dc0008b471da` | `588236d4d085b6923a80aefa50efeddbc1191736` | `ready` |

The metadata does not establish the reason for the error; no build-log diagnosis
is claimed. Do not call the latest repository commit deployed.
`git diff 588236d4d085b6923a80aefa50efeddbc1191736 df77804c828364c3987d98832641b203286b1aec -- apps/web`
is empty: application source at the ready commit matches the locally tested
baseline. W21 adds only these documents, not a new application artifact.

Branch URL:
https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app

| Public smoke | Observed result |
|---|---|
| `/` | 200 |
| `/auth/sign-in` | 200 |
| Anonymous `/app` | 307 to `/auth/sign-in?next=%2Fapp` |
| `/api/status` | reachable, server runtime, URL/key configured, Development target true |

Public smoke proves neither authenticated persistence nor user comprehension.
Deployment-to-exact-W21-commit gate is not satisfied by these observations.
No artificial application edit or new deployment was triggered.

## Release and safety decision

Hold scope. Evidence audit complete; **no evidence-backed feature change
required**. Do not label the real-user validation complete from absent observations.
Release remains BLOCKED pending the documented evidence, despite green local checks.

Only the two W21 documents are intended for the commit:
`docs(w21): establish first-user validation and release readiness gate`.
No application, SQL, migration, test or API changes. No main checkout/commit,
merge, force-push, protected PR modification, or Supabase Main operation.
Pre-existing untracked environment files remain untouched.

## Smallest steps to close the gate

1. Supply anonymized existing observations if available, or run the source
   protocol with 5-10 real participants. Do not reconstruct missing telemetry.
2. Fill the evidence template, classify actual friction and choose Continue,
   Change/narrow or Hold scope from the evidence.
3. Record the current authenticated full loop and authorized cross-user checks
   on Development with safe disposable-fixture cleanup; keep human learning
   evidence separate from technical checks and owner-confirmed W20 results.
4. Record exact release deployment/commit provenance and any required current
   schema evidence before promoting the release. Do not introduce a feature
   merely to produce a fresh deploy.

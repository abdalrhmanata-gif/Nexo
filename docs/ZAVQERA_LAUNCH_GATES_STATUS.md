# ZAVQERA Launch Gates Status

## Current PR #29 verification — 2026-10-25

- PR head `2921438c9736256a0651093a76b9a46fae38e5b1` passed [W21](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40195077112), [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40195077103), [Web CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40195077092), and [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40195077102). W21 used disposable PostgreSQL 17, passed 606 assertions across 42 SQL/pgTAP files, and verified cleanup. This is isolated CI evidence, not hosted schema parity.
- The Netlify workflow's real OpenAI planning smoke test now requires a same-repository PR and explicit `[live-openai-planning]` body marker. No live provider request was made for this candidate.
- The PR deployment job is excluded from PR events and manual/push deployment is branch-allowlisted. It uses Netlify `deploy-preview` context and contains no `--prod` option. PR route verification remains enabled separately. This is a workflow/source finding, not production deployment evidence.
- Merge-resolution commit `532a12ee6f6039634812c18ab855265dbf0cae86` exposed a duplicate top-level `pull_request` key; [Netlify workflow run 40196733336](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40196733336) failed before creating jobs. The duplicate is removed, the regression test now enforces exactly one PR trigger, and local targeted checks pass; CI on the corrected head is pending.
- PR #29 remains OPEN / Draft / Unmerged; Issue #23 remains open. This branch update resolves the two base-branch conflicts; the resulting exact head still needs CI and independent review.

**Decision: BLOCKED — this candidate is not production-ready and public launch is not authorized.**

Candidate code branch: `zavqera/alternative-web-deployment`

Candidate code commit: [`017da480d88eef32971a25d7febe32685368ccce`](https://github.com/abdalrhmanata-gif/Nexo/commit/017da480d88eef32971a25d7febe32685368ccce)

PR #29 remains open and Draft. Issue [#31](https://github.com/abdalrhmanata-gif/Nexo/issues/31) remains open.

This report distinguishes evidence for the candidate commit from historical evidence on PR #29's merge candidate. No hosted database writes, production deployment, production credential use, or secret values were involved.

## Candidate changes

The candidate changes only dependency security, CI runtime/lockfile compatibility, and deployment safety:

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `.github/workflows/web.yml`
- `.github/workflows/web-deploy-netlify.yml`
- `apps/web/test/netlify-preview-safety.test.mjs`

Commits on the target branch:

- `0bd38ccb715fa0acfe403d4a1f9c142da8e43597` — patch Next.js security advisories.
- `46291e7152843f70d0a33eeaf5d01c16b12a6c9d` — regenerate a CI-compatible lockfile with npm 10.8.2 and align Web CI runtimes to Node 22.
- `017da480d88eef32971a25d7febe32685368ccce` — make the branch-triggered Netlify workflow draft-preview-only and test that it cannot request production deployment.

The Web dependency patch updates `next` and `eslint-config-next` to 15.5.28, `sharp` to 0.35.5, and `source-map-js` to 1.2.2. The initial audit found one critical and two high advisories; the final Web lockfile audit reports zero vulnerabilities.

## Verification matrix

| Gate | Status | Evidence and qualification |
|---|---|---|
| Web unit suite | **PASS** | 140/140 tests pass locally. [Web Unit CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40186325334) passed on candidate SHA `017da48`. |
| Mission Authority controlled adapter | **PASS** | Dedicated CI step and complete suite passed on `017da48`; includes revoked, stale, lease, destination, authorization, approval, replay, and reconciliation boundaries. |
| Web lint | **PASS** | `npm run lint`; no ESLint issues. Next's `next lint` deprecation notice remains informational. |
| Web typecheck | **PASS** | `npm run typecheck`; also passed in CI. |
| Web production build | **PASS** | `npm run build`; Next.js 15.5.28 production build succeeds and runs the 140-test suite. [Web CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40186325328) passed on `017da48`. Existing Autoprefixer compatibility warnings are non-fatal. |
| npm lockfile clean install | **PASS** | `npm ci` with npm 10.8.2 succeeds after lockfile regeneration. This addresses the initial CI failure for missing optional `@emnapi` lock entries. |
| Web npm advisory audit | **PASS** | `npm audit`: zero vulnerabilities in the Web dependency tree. This does not cover Flutter packages or hosted configuration. |
| Flutter analysis/tests/CI | **PASS** | [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40186325350) passed on `017da48`. Local Flutter analyze/test and Android debug build also passed; Flutter Web is not configured. |
| W25 isolated PostgreSQL fence | **PASS, scoped** | [W25 CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40186325447) passed on `017da48`. This proves the isolated test harness's budget/idempotency race invariants, not production-schema correctness. |
| Netlify workflow safety | **PASS** | [Workflow run](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40186325348) passed its credential gate and skipped deployment because deploy credentials are absent. The checked-in workflow now uses a `deploy-preview` context, captures that draft URL, and verifies that preview; a regression test rejects production flags. **No preview was actually deployed or tested.** |
| Local authenticated browser E2E on `017da48` | **BLOCKED / NOT RUN** | Docker is unavailable in this environment. The local preflight also requires `ZAVQERA_E2E_MODE=disposable-full-loop` and `ZAVQERA_E2E_SUPABASE_WORKDIR`; neither was configured. |
| W21 disposable full-loop E2E | **PASS on current PR head `2921438`** | [W21 run](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40195077112) passed on exact PR head `2921438c9736256a0651093a76b9a46fae38e5b1`: disposable PostgreSQL 17, 42 SQL/pgTAP files, 606 assertions, browser E2E, and verified cleanup. It does not establish hosted Development parity or production recovery. |
| Current-branch W21 workflow | **PASS, isolated** | The checked-in workflow starts a disposable local Supabase/PostgreSQL stack and replays repository migrations; it does not require `ZAVQERA_DEVELOPMENT_DB_URL` or dump a hosted schema. The exact-head run is linked above. |
| Live AI provider verification | **NOT RUN** | No current Netlify Deploy Preview secret scope or valid non-production provider key could be verified. No live provider calls were made. |
| Hosted password-reset flow | **NOT RUN** | Local auth/confirmation tests pass, but a hosted reset email/session flow was not run. Netlify and Supabase dashboards were not available; avoid repeated reset emails. |
| Hosted Development migration parity, RLS, grants, and advisors | **BLOCKED / NOT VERIFIED** | No live Supabase read was performed in this audit and no SQL was executed. Issue #31 contains prior migration-ledger and private AI-table access concerns; those reports were not revalidated here. |
| Flutter dependency advisories / repository-wide Dependabot alerts | **NOT VERIFIED** | The npm audit covers only `apps/web`. GitHub Dependabot alert access was previously denied by the API; do not interpret this as a clean repository-wide dependency audit. |
| Independent security review | **BLOCKED / NOT COMPLETE** | Source tests and the Web dependency audit pass, but there is no independent review sign-off for the full PR #29 schema, RLS/grants, privileged functions, hosted auth, or runtime configuration. |

## Security, migration, and deployment boundaries

- No SQL was applied; no Supabase Main or production data was touched.
- The Development migration ledger and effective hosted RLS/API permissions were not re-read. The earlier Issue #31 report of migration-history drift and three private anonymous-AI tables with RLS disabled remains an unresolved, historical report—not a newly verified live finding.
- The W21 disposable PostgreSQL replay and cleanup evidence is for the PR #29 merge candidate described above. It is not a live Development migration-history check.
- The final target-branch Netlify workflow is preview-only. Its run skipped all deploy and route-verification steps because `NETLIFY_AUTH_TOKEN`/`NETLIFY_SITE_ID` are not configured; no production deploy occurred.
- At PR head `2921438`, the Netlify workflow uses `--context deploy-preview`, has no `--prod` option, excludes pull requests and non-allowlisted refs from the deploy job, and retains a separate PR preview-verification job. Its live OpenAI smoke test is opt-in only; no live provider call was made. This branch update resolves the base conflicts; fresh exact-head CI and independent review are still required.
- No secret values were requested, printed, added, or committed.
- The tested code candidate is `017da48`; the report is a separate documentation-only commit and does not alter that candidate. `main` was not changed. PR #29 remains Draft.

## Product and release decision

Owner-confirmed T01–T05 remain **owner-confirmed PASS only**; detailed user observations are absent. No quotations, timings, friction frequency, conversion, retention, or willingness-to-pay evidence is claimed. No repeated High-severity user friction was independently established, and no speculative product behavior was added.

Product unit/regression coverage passes, including mission/action lifecycle, follow-up, verification/outcome, authorization, and mission intelligence. Real-user validation and hosted end-to-end authentication remain incomplete. The candidate therefore does not meet the definition of done for a public release.

## Required next actions

1. Keep PR #29 Draft. Resolve its two conflicts against the current base branch and rerun required checks on the resulting exact PR head; obtain independent review before any merge decision.
2. Preserve W21's disposable-only workflow. Do not add a hosted Development schema dump as a prerequisite for isolated E2E.
3. Provide authorized read-only Development access to reconcile migration history and review effective RLS, grants, privileged functions, and advisors. Do not apply migrations as part of that audit.
4. Configure a non-production provider key directly in the correct Netlify Deploy Preview secret scope, then run bounded AI success/failure tests; do not send the key through chat or logs.
5. Run one authorized hosted password-reset test and verify cleanup/session behavior without repeated email requests.
6. Obtain an independent security review and verify Flutter/repository-wide dependency advisories with authorized tooling.
7. Obtain explicit owner approval for production backend, backups/restore, monitoring, deployment capacity, and release. No such approval is inferred here.

**Final status: BLOCKED / NO-GO.** The verified candidate fixes the dependency and deployment-workflow defects and passes the available code/CI gates, but live-provider, hosted security/migration, and owner-controlled release gates remain open.

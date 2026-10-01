# ZAVQERA final launch gate

Audit: 2026-10-01. Repository baseline:
`6a32654d0ab72c730b1221c7b0b45e8b55f31d79`.
Branch: `zavqera/alternative-web-deployment`.

**TECHNICAL MVP STATUS: PASS**, with the W21 owner-run E2E alternative retained.
**PUBLIC PRODUCTION LAUNCH STATUS: BLOCKED.**
**PRODUCTION BACKEND STATUS: OWNER DECISION REQUIRED before real public users.**

Public launch is not authorized by green code. The primary site returns 404,
production deploys are reported paused by the provider, and recoverable user-data
backups are not established. The tested branch is a separate working endpoint.
No production promotion, database switch, billing change or domain operation was
performed. See [launch runbook](ZAVQERA_LAUNCH_RUNBOOK.md).

## Classification

GREEN = READY in the stated evidence scope.
YELLOW = OWNER DECISION REQUIRED / explicit acceptance or setup.
RED = BLOCKED for public production, not necessarily a code defect.

| Area | Classification | Evidence and qualification |
|---|---|---|
| CODE | GREEN / READY | No runtime diff after tested `a89d0a1`; no new defect found |
| TESTS | GREEN / READY | 128 passed, 0 failed, 0 skipped; typecheck/lint/build passed |
| DATABASE | GREEN / READY for Development | W20/W21 present; guards, RLS, grants and history rechecked read-only |
| AUTH | YELLOW / OWNER DECISION REQUIRED | Source checks and anonymous redirects pass; real-auth browser E2E unexecuted |
| SECURITY | YELLOW / OWNER DECISION REQUIRED | No source-review finding; 0 advisor errors, 6 warnings including disabled leaked-password protection |
| DEPLOYMENT | RED / BLOCKED for primary production URL | Tested branch ready; primary old main deployment returns 404; production deployment pause banner |
| ENVIRONMENT | YELLOW / OWNER DECISION REQUIRED | Netlify production context points to Development; dedicated production backend preferable |
| DOMAIN | YELLOW / OWNER DECISION REQUIRED | Custom domain NOT CONFIGURED; working branch subdomain can support an explicitly approved controlled beta |
| MONITORING | YELLOW / OWNER DECISION REQUIRED | Provider dashboards/commit checks exist; no established uptime/error alerting or staffed incident contact |
| BACKUP/RECOVERY | RED / BLOCKED for real user data | Free plan reports no project backups; no independent backup or restore drill verified |
| ROLLBACK | YELLOW / OWNER DECISION REQUIRED | Procedure documented, existing branch artifact ready; production execution/permissions not rehearsed |
| USER EVIDENCE | GREEN / READY, owner-confirmed | T01-T05 PASS; missing detail is a limitation, not a blocker |

## Repository and runtime

Protected local main remains `fcac980c9909c1a083007ed120d4742584fbcb4e`.
Remote main was read-only checked at
`89ff12f23fba21eee11aad593275ec23477ec6ec`; it differs from local main and was
not fetched into, merged into, or pushed from this worktree.
Initial tracked tree was clean; pre-existing `.agents/` and `skills-lock.json`
remain untouched. Only the two launch documents are intended changes.
The build-generated next-env comment was removed; no runtime correction needed.

Compared all changed paths between current baseline and runtime
`a89d0a1b1516fffc53c981c594202da602b33808`: only README, tests, SQL test scripts
and W21 documents differ. App routes, components, libraries, middleware,
dependency manifests/lockfile and Netlify build configuration do not.
**The deployed branch runtime remains functionally identical to current source.**
No unnecessary deployment was triggered; a documentation push may still invoke
the project's existing provider automation.

Fresh results from apps/web:

| Command | Result |
|---|---|
| `npm test` | PASS: 128 tests, zero failures/skips |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; next lint deprecation notice only |
| `npm run build` | PASS; Next.js 15.5.25 SSR/middleware/routes built |
| `npm run test:e2e` | Exit 2 before mutations: opt-in/workdir absent |

## Netlify: branch is not production

Site: `unique-kringle-3ce321`.
Site ID: `53e470f1-30da-497e-85f6-16179db4c985`.

| Surface | URL / deployment | Result |
|---|---|---|
| Tested branch | https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app | Public and functioning |
| Tested ready artifact | `6abe25c07d794f000812021c`, commit `a89d0a1b1516fffc53c981c594202da602b33808` | ready, correct branch |
| Primary production URL | https://unique-kringle-3ce321.netlify.app | `/`, `/auth/sign-in`, `/api/status` all 404 |
| Published production artifact | `6aba41d27d13f7000874b0a7`, commit `89ff12f23fba21eee11aad593275ec23477ec6ec`, branch main | Metadata says ready; not the tested application |

Dashboard explicitly reports operational credits only: published sites remain
live, **production deploys and Agent Runners are paused** until next billing
cycle or an owner-selected upgrade. Branch readiness does not override this
production restriction. No account/billing change made.

Visitor access: production and Deploy Preview visibility Public. Published and
unpublished firewall traffic allows all; no IP/geographic restrictions set.
Baseline WAF disabled (paid upgrade offered). Untrusted fork deploys require
approval. Neither a secret URL nor app sign-in makes this an invite-only beta.
Owner must select beta access policy before sharing.

Environment keys/contexts only (no values retained):

| Key | Scopes | Contexts |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All | Same value across deploy contexts |
| `NEXT_PUBLIC_SUPABASE_URL` | All | Production, Deploy Previews, Branch deploys, Local development populated; Preview Server & Agent Runners empty |

Production URL setting was compared privately to the expected Development host:
**targets Development = true**. No raw value or key printed. The branch
`/api/status` independently reports configured URL/key, server runtime and
Development target. Primary `/api/status` is unavailable (404), so its runtime
backend is not inferred from the setting.

Production is a Netlify deployment context, not proof of a separate production
database. A dedicated backend is preferable for real user records, operational
separation and backups. No new project, Supabase Main access, credential rotation
or context switch is authorized.

## Supabase read-only final audit

Only `mrwmmbytcymqgwvcoywd` inspected. History has 25 entries including
W18 `20260929182538`, W20 `20261001081755`, W21 `20261001091146`.
Existing historical replay limitation remains documented in
[W21 readiness](ZAVQERA_W21_RELEASE_READINESS.md); no old migration reconstructed.

Live function-definition MD5:

| Function | Fingerprint |
|---|---|
| `commit_verified_mission_outcome` | `94246c09b4ed0140d4d4b13fcfbc4249` |
| `transition_mission` | `0d8ba1d4d0312b42d170996e5c0c4437` |
| `guard_mission_action_insert` | `9d9584a39cbb88a48193f6b1c2b7ae96` |
| `create_mission_verification` | `3e3818b3ff3c839198ea8945c28a2e51` |
| `transition_mission_action` | `1a7558b637df212d20bcaa18b006ac74` |
| `update_mission_details` | `00811d656d6ee0e632ee219fa375c8c2` |

W20/W21 match their verified deployment fingerprints. All inspected functions
retain intended SECURITY DEFINER and `search_path=pg_catalog, public`.
Five public mutation RPCs allow authenticated EXECUTE without PUBLIC/anon;
the trigger helper is not directly executable by authenticated.
Mission/action ownership and workspace policies persist; initial mission
INSERT restriction and action insertion/completion guard persist.
RLS enabled on missions, actions, events, verifications and outcomes.
Append-only history triggers, immutable action parent and deletion-history
guard remain. No writes or fixtures were run in this launch audit.

Previous W21 live matrix: 19 PASS summaries covering A-J, follow-up read-back,
verification/outcome, ownership, action lifecycle and zero-fixture rollback.
This is prior behavioral evidence plus a current schema check, not a new
authenticated run.

Security Advisor rerun: **0 errors, 6 warnings, 0 suggestions**:
five signed-in SECURITY DEFINER warnings for the public RPCs above are intentional
command-boundary design, not permission to remove guards or convert blindly.
The sixth is **Leaked Password Protection Disabled**. No new critical/error
warning appeared in this rerun. Do not purchase Pro or change auth settings
without owner authorization. Advisor output is not blanket security certification.

Backups page: **Free Plan does not include project backups**. No external backup
inventory or restore rehearsal was verified. A schema-only E2E snapshot is not
a backup of user data. Choose and prove a recovery policy before public data intake.

## Auth/security and anonymous smoke

Source-only security review of auth signup/signin/signout, callbacks/session
middleware, API boundaries and W21 guard found no high-confidence exploitable
defect. No secret values inspected. Local regression covers PKCE/token-hash
callbacks, safe redirects, authoritative identity/ownership and server mutation
boundaries. No privileged browser credentials or hardcoded access tokens were
found within the reviewed scope; publishable configuration is permitted.

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| - | - | Reviewed auth/API/W21 scope | - | None found | Source-only review |

Fresh branch smoke: `/` 200; `/auth/sign-in` 200; `/app`,
`/app/missions/new` and a non-existent protected mission path each 307 to
same-origin sign-in with encoded next path. `/api/status` reports server runtime.
No protected record was requested with credentials or leaked in these redirects.
This establishes anonymous protection and SSR routing only, not successful login,
session refresh, persistence or cross-user behavior in a browser.

## Owner decisions before public launch

1. Select backend strategy: explicitly approved limited Development beta versus
   separately authorized dedicated production backend. Include data retention,
   backup storage/retention, recovery objectives and restore rehearsal.
2. Resolve Netlify production capacity (wait or authorized plan change), then
   explicitly authorize publishing tested code to the chosen public URL without
   modifying protected main. Verify primary routes after that operation.
3. Select public access/beta restrictions and domain: Netlify URL can serve an
   approved beta; branded domain/DNS requires ownership and explicit approval.
4. Assign operational incident contact and backup contact, alert recipients and
   review cadence; decide leaked-password protection/risk treatment without an
   implicit billing upgrade.
5. Schedule owner-run isolated E2E or explicitly accept its unexecuted status
   for the intended launch stage. Never relabel setup readiness as execution.

No paid infrastructure, DNS, auth policy, production deployment or rollback
was changed. main, Supabase Main and PRs #12/#19/#20 remain untouched.

## Human evidence boundary

Each of T01, T02, T03, T04 and T05 is recorded only as:
**Owner-confirmed PASS; detailed session observations were not recorded.**
No quotes, timings, friction frequency, retention or conversion were invented.
No repeated high-severity user friction was established by this launch audit,
and no speculative product behavior change was made.

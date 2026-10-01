# Minimum production operations

2026-10-01. **Procedure ready; monitoring PARTIAL; public launch not authorized.**
No monitoring purchase, integration or schedule was enabled.
Use the [launch runbook](ZAVQERA_LAUNCH_RUNBOOK.md) for exact safe smoke commands
and [owner decisions](ZAVQERA_OWNER_LAUNCH_DECISIONS.md) before activation.

## Ownership and cadence

Incident owner/backup contact/channel/coverage hours: **UNASSIGNED**.
The project owner must assign a reachable primary and cover privately before
public intake. Netlify's configured deploy-request owner emails and preview
commit checks are not application-error or uptime alerts.

Proposed minimum: verify before/after each deployment, at the start of every
controlled-beta session, daily during user intake, and immediately after a
report. Owner must assign this cadence; it is not unattended monitoring.

| Step | Procedure | Evidence / escalation |
|---|---|---|
| 1. Deployment | Netlify site `unique-kringle-3ce321`: verify artifact state, source SHA, branch and target URL separately | Known-good branch artifact `6abe25c07d794f000812021c` / `a89d0a1`; old main artifact is not approved rollback |
| 2. Public health | Anonymous GET `/`, `/auth/sign-in`, protected `/app` and mission routes using runbook | Branch: 200 public, 307 same-origin sign-in protected. Primary currently 404; do not classify that as a new branch regression |
| 3. Authentication | Run the isolated [E2E checklist](ZAVQERA_E2E_OWNER_RUN_CHECKLIST.md) for signup/signin/signout, callback, refresh/return and cross-user checks | Browser E2E not executed. A hosted auth-only check requires an owner-approved account; no automated hosted fixture creation |
| 4. Provider logs | Review Netlify Deploys/build and server/function logs plus approved Supabase Auth/Postgres Logs Explorer time window | Record UTC, deployment, status and sanitized request ID; never dump personal records, cookies or JWTs |
| 5. Escalation | Notify assigned incident owner for repeated 5xx/auth failure, data integrity/ownership concern, failed backup or capacity pause | Security/data-loss concerns urgent: halt invitations/releases, preserve restricted evidence; changes require authorization |
| 6. Rollback | Follow runbook: focused branch revert or owner-approved known-good artifact publish; recheck compatibility, capacity and URL | Procedure prepared, not rehearsed. Never force push, modify main, undo W21 guard or restore a database as routine code rollback |
| 7. Incident ownership | Record responsible person, impact, containment approval, communication and resolution time | Missing coverage must remain visible; no fabricated on-call SLA |
| 8. Secrets | Use private provider/owner secret stores; keep evidence metadata-only | No privileged NEXT_PUBLIC variables, full payload exports or pasted credentials |

If authorized to inspect a hosted account, sign in manually without exposing
credentials, confirm return/refresh, sign out and check protected-route redirect.
Do not edit that person's missions. This limited check does not replace local
full-loop/cross-user E2E. Confirmation-email and new-domain checks are a separate
owner-coordinated auth smoke, not permission to leave synthetic hosted fixtures.

## Current operational limits

Production, branch deploys and deploy previews all map to Development.
Primary production serves the old main artifact and checked routes return 404.
Netlify explicitly reports production deploys paused by operational-credit
limits. Read provider status first; do not press Deploy/Publish to probe capacity.
Owner chooses wait or upgrade; upgrade does not itself approve promotion.

No verified uptime monitor, runtime-alert destination, comprehensive live error
review, backup receipt or restore rehearsal exists. Review provider retention
and usage limits before relying on logs; avoid enabling paid logging.
Five intentional SECURITY DEFINER advisor warnings and disabled leaked-password
protection remain documented in the final gate, not silently waived.

For resolution: prove the selected artifact and safe health routes, rerun
relevant tests, confirm auth/data boundary when impacted, verify recovery/cleanup,
and record any remaining limitation. Only the owner may approve renewed intake.
Reference [backup plan](ZAVQERA_PRODUCTION_BACKUP_AND_RECOVERY.md) and
[domain plan](ZAVQERA_DOMAIN_LAUNCH_PLAN.md) for recovery and hostname changes.

# ZAVQERA launch runbook

Scope: operations for the tested MVP, not public-launch authorization.
Read [final launch gate](ZAVQERA_FINAL_LAUNCH_GATE.md) before inviting users.
Only Development `mrwmmbytcymqgwvcoywd` is authorized for inspection here.
No main changes, Supabase Main access, paid resources, DNS, credential rotation
or deployment promotion without explicit owner approval.

## Operating record and contact

Release owner: project owner with Netlify/Supabase administrative access.
**Incident contact/channel, backup contact and coverage hours: owner must assign.**
The Netlify account owner receives deploy-request emails; this is not a verified
incident escalation service. Do not publish private account contact details.
Record a private reachable channel before real user intake.

Working branch URL:
https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app

Site ID: `53e470f1-30da-497e-85f6-16179db4c985`.
Known-good W21 runtime: `a89d0a1b1516fffc53c981c594202da602b33808`.
Known-good artifact: `6abe25c07d794f000812021c` (ready).
Primary https://unique-kringle-3ce321.netlify.app is **not currently the working
application**; its checked routes return 404. Do not advertise it as ready.

## Deployment verification

1. Confirm clean tracked tree, intended branch and protected main SHA. Review
   changed paths against the tested runtime; docs/tests alone need no new deploy.
2. Run from apps/web: `npm test`, `npm run typecheck`, `npm run lint`,
   `npm run build`. Record counts and exact commit.
3. In Netlify Deploys verify `state=ready`, exact `commit_ref` and branch. A
   successful build or Git push alone is not deployment evidence.
4. Check the intended URL's published artifact separately from branch artifacts.
   Project production currently tracks an older main artifact. Do not switch
   production branch or publish a branch artifact under this runbook alone.
5. Inspect environment **keys and contexts**, never export values: production,
   branch and preview settings may differ. Currently production points to
   Development; owner decision is required before real public records.

Provider now reports production deploys paused by operational-credit limits.
Do not assume a production redeploy/rollback rebuild will work. Escalate the
capacity decision; neither purchase nor modify the subscription automatically.

## Health smoke

Run only safe anonymous GETs; choose the explicit approved URL:

```powershell
$base = 'https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app'
foreach ($path in @('/', '/auth/sign-in', '/app', '/app/missions/new',
  '/app/missions/00000000-0000-4000-8000-000000000000')) {
  curl.exe --silent --output NUL --write-out "$path %{http_code} %{redirect_url}\n" "$base$path"
}
```

Expect public pages 200 and protected paths 307 to same-origin sign-in. Check
`/api/status` for server runtime/configured flags only. Never treat configuration
booleans as database connectivity, successful auth or completion evidence.
Do not log cookies, Authorization headers, user mission data or full error payloads.

## Auth and isolated full-loop check

Review `apps/web/README.md` before setup. **Never run E2E on hosted Development.**
No shared test password is required; two users are generated through local sign-up.

One-time owner setup (fresh, dedicated workdir only):

```powershell
supabase --version
docker version --format '{{.Server.Version}}'
New-Item -ItemType Directory -Path C:\zavqera-e2e
supabase init --workdir C:\zavqera-e2e
```

Use native Supabase on PATH, not just a `.cmd` shim. Configure
`supabase\config.toml`: project_id `zavqera-e2e-local`, db major_version 17,
local email confirmations disabled. Never link this workdir to a hosted project.
Create `C:\zavqera-e2e\ZAVQERA_E2E_DISPOSABLE` containing only the project ID;
this consents to destruction of that local stack, not any other project.

Obtain the current schema-only public/private snapshot using the exact
Development-only dump instructions in the README through a private secure shell.
No data/roles/managed auth schema export. Restore the documented application auth
trigger in that same snapshot. Put exactly one reviewed
`<14-digit timestamp>_development_schema.sql` in the workdir migrations directory.
Check W20/W21 definitions, grants and policy/trigger against current evidence.
Do not replay the incomplete repository history or commit the snapshot.

From apps/web in a fresh shell without hosted or privileged credentials:

```powershell
npx playwright install chromium
$env:ZAVQERA_E2E_MODE = 'disposable-full-loop'
$env:ZAVQERA_E2E_SUPABASE_WORKDIR = 'C:\zavqera-e2e'
npm run test:e2e
```

Do not set `NEXT_PUBLIC_SUPABASE_*`; the harness derives local values.
Unset service-role/secret/access-token/database-password variables and legacy
E2E user variables; preflight lists names without values. Free port 3210 first,
without killing unrelated processes. Exit 2 means blocked, not skipped success.

The harness checks sign-in/out, cookies, mission/actions, next action, Waiting,
follow-up leave/return, verification/outcome, cancellation, UI/direct-RPC refusal,
cross-user rejection and teardown. Do not weaken failures.
Capture test status and sanitized fixture-ID ledger plus cleanup proof.
No browser execution occurred on this host during launch preparation.

After interruption, cleanup only the explicitly consented local project:

```powershell
supabase stop --no-backup --workdir C:\zavqera-e2e
docker ps -aq --filter label=com.supabase.cli.project=zavqera-e2e-local
docker volume ls -q --filter label=com.supabase.cli.project=zavqera-e2e-local
```

Both Docker queries must return no IDs. If not, stop and inspect those exact
resources; never use global prune, broad deletion or disable history protections.
Hard process termination can prevent teardown; the next preflight cleans before
starting. Until verified, mark CLEANUP NOT VERIFIED.

## Monitoring and incident response

Current monitoring is **PARTIAL**, not an alerting SLA:

| Signal | Existing surface | Operator action |
|---|---|---|
| Deployment | Netlify Deploys, build logs, GitHub preview commit checks | Check exact SHA/state before sharing; investigate failed/paused builds |
| App/SSR/API errors | Netlify Logs / Functions / Next.js server handler logs | Filter by deployment and incident time; inspect status/exception without exporting user data |
| Database/auth | Development Logs Explorer and Auth logs | Check time window, permission failures, connection errors and sign-in failure patterns |
| Security posture | Development Security Advisor | Read-only rerun; record changes rather than blindly applying suggested grants |
| Availability | Manual safe smoke above | Owner sets review cadence or authorizes a no-cost monitor |
| Notifications | Netlify preview commit checks and deploy-request owner emails | Not proof of runtime/uptime alerts; owner chooses recipient/incident channel |

No new paid monitoring or log drain enabled. Do not claim zero runtime errors
from available dashboard links; no comprehensive user-log audit was performed.

For an incident: record UTC time, affected URL, deploy/commit, symptoms and
sanitized request IDs. Notify the assigned owner; halt invitations/releases.
Classify access/data-integrity issues as urgent. Preserve logs securely, avoid
reproducing against personal records, and isolate impact only through an
owner-authorized operational change. Check provider status and plan limits before
changing code. Close only after regression, safe smoke, relevant auth/SQL proof
and cleanup; communicate residual impact honestly.

## Rollback

**Procedure ready; execution not rehearsed.**
Do not roll back W21's completion guard or reapply W20.

- For a new runtime regression, prefer a focused revert commit on the allowed
  branch, run the full gate and deploy after authorization/capacity check.
- For urgent artifact rollback, owner inspects the known-good Netlify deploy,
  confirms source/environment/database compatibility and exact target URL before
  using provider publish/rollback controls. Publishing a branch artifact may
  affect the primary URL: do not assume it changes only the branch alias.
- A primary-production operation requires explicit approval; no main merge or
  force push is a prerequisite. Never publish the known-broken old main artifact
  merely because its metadata says ready.
- Verify ready artifact and routes after rollback. Existing deploy publish
  behavior during plan pause is untested; do not promise emergency recovery time.
- Database changes require a separately reviewed, data-preserving forward fix or
  restoration plan. An application rollback does not restore database contents.

## Database safety and backup/recovery

Current Development has W20 `20261001081755` and W21 `20261001091146`.
Verify exact target before each read/write. Existing history mismatch prevents
trustworthy empty replay: no broad `db push`, no invented old migrations.
Ownership, fixed search_path, function grants, locking/version checks,
verification/outcome rules and append-only history must remain intact.

**Recovery coverage is missing for public user data.** Backups dashboard says
Free Plan does not include project backups. No external backup or restore drill
was verified. Schema-only E2E dumps and Git do not recover user records.

Owner must choose data retention, backup frequency, secure encrypted storage,
access policy, recovery-point and recovery-time objectives; authorize any cost
separately. A backup plan must account for database data, auth recovery and any
external storage actually used. Test restore in an explicitly authorized
disposable target, not Supabase Main or the live Development project. Record
restored counts/integrity/auth behavior and timing without putting data in Git.
Do not accept public records until backup and restoration evidence meets the
owner's approved objectives.

## Domain and owner-only changes

Custom domain: **NOT CONFIGURED**. A Netlify branch URL is usable for an approved
controlled beta, not proof of branded production readiness.
After the owner chooses/owns a domain and authorizes connection: Netlify project
Domain management -> Add domain; use the exact DNS records Netlify provides at
the existing DNS provider, verify TLS, choose canonical hostname and redirects,
then authorize matching Supabase Site URL/redirect allowlist updates.
Test confirmation/callback/logout on that origin. Do not guess DNS records,
purchase a domain or alter auth redirect settings automatically.

Production backend selection, data migration, paid backup/password protection,
Netlify capacity, domain/DNS, visitor restrictions, alert destinations and
credential rotation remain owner-only decisions. Resolve the primary 404
deployment before announcing that URL. Production currently targets Development;
never silently point it to Supabase Main.

## Secrets and known limitations

Use provider secret stores or private operator environment; never chat, Git,
schema dumps with data, logs or screenshots containing credentials.
Publishable Supabase keys may be browser-visible; service-role keys, database
passwords and management tokens may not. Never add privileged `NEXT_PUBLIC_*`.
Show key names, scopes and target-match booleans, not values.

Known limits: browser E2E unexecuted; no restore rehearsal; no staffed incident
channel; primary URL 404; production deploy pause; no custom domain; disabled
leaked-password protection; intentional SECURITY DEFINER advisor warnings;
historical replay mismatch; T01-T05 owner-confirmed without detailed observations.
These are not authorization to weaken security, modify protected systems or
expand product scope.

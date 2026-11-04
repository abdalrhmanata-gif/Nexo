# Owner launch decisions

2026-10-01. **TECHNICAL MVP: PASS. PUBLIC PRODUCTION: NOT AUTHORIZED YET.**
The owner selected the preferred strategy for all five decisions: dedicated Supabase
Production, Netlify paid capacity, Supabase Pro managed backups, a custom domain,
and local isolated E2E execution. This records the selected direction only; no
payment, project provisioning, deployment promotion, DNS change, or public launch
has occurred. Exact domain selection and provider billing completion remain pending.

## Decision 1: Production backend strategy

- [x] Dedicated Supabase Production, separate from Supabase Main.
- [ ] Explicitly accept Development for a controlled beta.

**Selected by owner; project creation awaits plan eligibility/billing.**

Production, branch-deploy and deploy-preview contexts currently all target
Development. A separate production data boundary is preferable for real users.
If beta is chosen, record participant/data scope, public-URL access limitations,
retention, recovery and risk acceptance; it does not approve broad public intake.
Backend selection alone does not authorize provision/migration/context switching:
approve the exact target and change plan before execution.

Owner selection/approval/date: ___

## Decision 2: Netlify deployment capacity

- [ ] Wait for the new billing cycle.
- [x] Upgrade the plan.

**Selected by owner; no upgrade/payment executed in this preparation step.**

Provider reports production deploys paused; no paid action taken. Primary URL
still serves old main artifact and returns 404; tested branch URL works.
After capacity returns, separately confirm the exact tested artifact/URL for
promotion without modifying main. Payment approval is not blanket deployment
approval. No Publish attempt was made to probe whether limits can be bypassed.

Owner selection/approval/date: ___

## Decision 3: Backup strategy

- [x] Supabase Pro managed backups.
- [ ] External encrypted `supabase db dump` exports.

**Selected by owner; backups are not active until Production is provisioned and verified.**

Follow [backup/recovery plan](ZAVQERA_PRODUCTION_BACKUP_AND_RECOVERY.md).
Current recovery coverage is unverified. With the choice, approve RPO/RTO,
schedule/retention, private storage location, backup/restore owners and a restore
drill. Option B is not the E2E schema-only snapshot; Option A is not PITR by default.
Assign incident contact/coverage via [operations](ZAVQERA_PRODUCTION_OPERATIONS.md)
as an implementation requirement; no extra paid service is assumed.

Owner selection/approval/date: ___

## Decision 4: Domain

- [ ] Continue the temporary Netlify URL.
- [x] Connect a custom domain.

**Selected by owner; exact hostname, purchase and DNS changes remain pending.**

Temporary working URL:
https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app

Custom domain is absent. The currently broken primary URL is not the temporary
beta URL. Follow [domain plan](ZAVQERA_DOMAIN_LAUNCH_PLAN.md); identify exact
hostname and approve DNS/TLS/auth changes before execution. No purchase implied.

Owner selection/approval/date: ___

## Decision 5: E2E

- [x] Execute the owner-run local Docker test.
- [ ] Explicitly accept unexecuted E2E for the chosen launch stage.

**Selected by owner; execution awaits the local Docker/Supabase prerequisites.**

Use [checklist](ZAVQERA_E2E_OWNER_RUN_CHECKLIST.md). No browser PASS is claimed.
Acceptance must name the limited stage, residual auth/browser risk and reviewer;
it does not waive ownership/verification guards or establish backup readiness.
Never run automated full-loop tests against hosted Development.

Owner selection/approval/date: ___

## Applying the decisions

The strategic options are now selected. Complete the prerequisites listed above,
confirm exact variable contexts and project refs before any changes, collect actual
verification evidence, and update the
[final gate](ZAVQERA_FINAL_LAUNCH_GATE.md). Choices alone do not prove completion
of infrastructure, restore or deployment work, and do not authorize public launch
until the agreed prerequisites are satisfied.

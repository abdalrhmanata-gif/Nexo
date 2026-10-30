# ZAVQERA Mission Authority — Development Schema Reconciliation (2026-10-01)

Target: ZAVQERA Development mrwmmbytcymqgwvcoywd
Method: Read-only PostgreSQL catalog inspection; no rows were exported or changed.
Related issue: #25

## Result

The current Development schema supports mission ownership, versioned mission/action transitions, append-only mission history, verification and outcomes. It does not currently contain dedicated persisted authority, lease, approval, attempt, idempotency or budget state for a general external execution boundary.

### Confirmed existing columns

missions: id, workspace_id, owner_id, objective, status, created_at, updated_at, version.

mission_actions: id, mission_id, title, position, status, follow_up_at, created_at, updated_at, version.

History tables contain mission/owner references plus event, verification and outcome evidence.

### Confirmed existing constraints

The live catalog has primary/foreign keys and mission_actions_mission_position_key. No current unique constraint was found for an external execution idempotency key.

## Decision

Do not modify Development yet.

The Controlled Adapter persistence requirements cannot be implemented safely by silently reusing the existing mission/action/history tables. The required authority revision, lease fence, exact approval binding, attempt state, idempotency key and atomic budget reservation are not represented as dedicated persisted state today.

The next schema step, after executable test evidence, should be a narrowly scoped design for the minimum dedicated authority/attempt persistence and one atomic server-side authorization/dispatch transaction boundary. Existing mission/history tables should be referenced by foreign keys where appropriate rather than overloaded with unrelated mutable security state.

The design must preserve current append-only history semantics and the actual auth.users to private.handle_new_user_profile hook.

## Evidence gate still open

GitHub Actions is not exposing a workflow run for the new Web test workflow from this branch. The existing Flutter workflow has been extended to run the same Web controlled-adapter tests, but no run is yet visible. Therefore no CI PASS is claimed.

No migration, RPC, RLS, grant, deployment, billing or Supabase Main change was made by this step.


## Read-only Development schema follow-up — 2026-10-11 (W43–W66)

This follow-up supersedes the historical 2026-10-01 schema snapshot where it conflicts with the present feature branch. It is based on a read-only catalog check of the connected **ZAVQERA Development** project on 2026-10-11. No table rows were read; no schema, grants, data, deployment, or billing were changed.

### Current state observed

- The live migration registry ends at **W65** (`20261011150000_w65_agent_execution_table_write_boundary`). W66 (`20261011160000_w66_service_role_table_privilege_hardening.sql`) exists on this feature branch and is included in the disposable W21 migration replay, but its dedicated `w66_service_role_table_privilege_hardening.sql` test was not yet wired into W21 at the recorded HEAD. Therefore **the W66-specific pgTAP assertions were not yet executed** there. W66 has **not been applied to hosted Development**.
- Development contains `public.agent_executions` with attempt status, authority snapshot, request/result/evidence, idempotency key, lease/heartbeat, retry lineage and reconciliation timestamp. Workspace-scoped idempotency uniqueness and the W56/W60 duplicate and request-binding guards are present.
- `public.mission_approvals` has explicit expiry and one-use consumption fields from W57–W60; the SQL scope binds the exact request/authority and destination/audience where execution approval is required. W61/W62 store a bounded payload-shape preview and redact secret/PII-like field names.
- W63 restricts generic execution completion to the trusted service role, requires meaningful `provider_receipt` evidence for `SUCCEEDED`, and refuses completion after the execution lease expires. W64 provides a narrow authenticated completion route for the requesting user's read-only research, with explicit `verified=false`, source-shape checks and an active lease. W65 removes direct table write grants from public/anon/authenticated.
- A separate read-only privilege query still showed direct table privileges for `service_role` in hosted Development. That is consistent with the fact W66 is branch-only. No live SQL was applied to address it.

### What this does not prove

1. The current ledger does not have dedicated, normalized columns/counters for all Mission Authority bindings and action/spend budget reservation. Some exact approval data is represented inside JSON scope, but that does not establish a common enforcement boundary for every dispatch.
2. W25's two-session race proof creates its own `authority_state`, `execution_attempts` and `authorize_attempt()` test objects. It proves those test objects' concurrency semantics; **it does not call the current `public.start_agent_execution` RPC or prove that `public.agent_executions` atomically reserves Mission Authority action/spend budget at real provider dispatch**.
3. There is no verified end-to-end path that couples an authoritative JIT decision, durable budget reservation, attempt creation, external I/O and provider-specific UNKNOWN reconciliation across independent workers.
4. Hosted OpenAI Research/citations/history and real Resend inbox delivery remain unverified; automated tests use a disposable stack/mock where applicable.

### Exact-head test evidence

On candidate HEAD `95fcbb5ee64548e2e5b4117284474c9ff0e34b01`, all six automated gates passed: [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38169191379), [Web CI/build](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38169191459), [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38169191360), [W25 disposable PostgreSQL fence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38169191369), [Netlify Preview verification](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38169191404), and [W21 local launch gate](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38169191446). W21 completed PostgreSQL 17 migration replay/pgTAP, AI quota/plan/workspace security tests, browser E2E (2/2), disposable-stack cleanup verification and artifact uploads.

### Decision after W67 — 2026-10-11

W67 now invokes the actual migration-replayed `public.start_agent_execution` RPC through two independent sessions in the disposable W21 Supabase PostgreSQL 17 stack. Same-key concurrent start, exact replay refusal, changed-request refusal, one durable attempt row, and one start event passed on candidate HEAD `c1ce23840f442edcf7a84149f34e7b8b3ba460f4`: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577786.

This closes the **actual-ledger idempotency race** subtask only. It does not prove the remaining atomic action/spend budget reservation, simultaneous revocation/expiry against a real dispatch claim, or provider-side reconciliation. The current schema has no dedicated atomic Mission Authority budget reservation/counter. Keep issue #25 open and do not apply a new schema change or W66 to hosted Development from this session. W66 remains branch-only; the read-only hosted privilege catalog still showed service_role's existing direct table grants before any deployment of the migration.

Next: design and independently test the smallest durable action/spend reservation invariant in disposable PostgreSQL 17; only then propose a schema/RPC migration. Production JIT dispatch and real-provider UNKNOWN reconciliation remain **NOT ESTABLISHED**.

PR #29 remains OPEN / Draft / UNMERGED. Supabase Main/Production and hosted Development remain untouched.


---

## Exact W79 RPC parity verification — 2026-10-12 — `aa57552bf28e35693106ccb04a808b97c5bfa9a7`

This read-only comparison supersedes earlier notes that described W64/W65 parity as the last known state. Current hosted project: **ZAVQERA Development** (`mrwmmbytcymqgwvcoywd`), PostgreSQL 17.6.1, region `eu-west-1`. No rows were exported or changed and no schema write was executed.

### Exact migration-history drift

The hosted migration registry ends at `20261011150000_w65_agent_execution_table_write_boundary`. The active PR branch contains but the hosted migration registry does not contain:

- W66 `20261011160000_w66_service_role_table_privilege_hardening.sql`
- W68 `20261011170000_w68_persistent_authority_budget_reservations.sql`
- W69 `20261011180000_w69_one_time_jit_dispatch_claim.sql`
- W70 `20261011190000_w70_durable_unknown_outcome_reconciliation.sql`
- W71 `20261012070000_w71_expired_external_execution_budget_recovery.sql`
- W73 `20261012120000_w73_trusted_system_mission_events.sql`
- W74 `20261012130000_w74_reconciliation_claim_freshness.sql`
- W75 `20261012140000_w75_correlatable_provider_receipt.sql`
- W76 `20261012150000_w76_guard_external_success_on_insert.sql`
- W77 `20261012160000_w77_read_only_research_payload_bounds.sql`
- W78 `20261012170000_w78_bind_research_history_to_execution.sql`
- W79 `20261012180000_w79_trusted_research_completion.sql`

The direct read-only catalog check returned no hosted functions for `claim_agent_execution_dispatch`, `claim_agent_execution_reconciliation`, or `reconcile_agent_execution_outcome`. Hosted `public.agent_executions` lacks the W69/W70 dispatch/reconciliation claim columns; the table inventory also did not contain `public.mission_authority_budgets` or `public.mission_authority_budget_reservations`.

### W79 callable-signature mismatch

Hosted Development still has the old W64 six-argument signatures:

- `public.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)`
- `private.complete_read_only_research_execution(uuid,text,jsonb,jsonb,text,text)`

The active W79 branch intentionally drops those signatures and replaces the public/private entry points with a trusted seven-argument signature starting with `p_requested_by uuid`. Thus W79 route-to-RPC compatibility **is not present on hosted Development yet**. Do not treat local E2E PASS as a hosted Research E2E result.

### Gate result versus hosted result

On branch HEAD `aa57552bf28e35693106ccb04a808b97c5bfa9a7`, all six CI/preview gates passed:
- Web Unit 312/312: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38248625542
- Web CI/build: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38248625311
- Flutter CI: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38248625550
- W25: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38248625229
- Netlify preview verification: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38248625472
- W21 (PG17 replay, W63–W79 regressions, W72 fake-provider integration, browser E2E 2/2 and clean teardown): https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38248625444

**Status:** isolated PostgreSQL schema/migrations and gateway test **PASS**; hosted Development schema parity **BLOCKED / NOT VERIFIED**. Issue #23 explicitly prohibits hosted Development schema modifications in this workflow; no migration was applied. An authorized migration plan/review and separate hosted validation are required before claiming hosted Research compatibility. Supabase Main/Production and production deployment remain untouched. PR #29 stays OPEN / Draft / UNMERGED.

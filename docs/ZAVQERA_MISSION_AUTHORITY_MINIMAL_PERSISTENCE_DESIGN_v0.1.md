# ZAVQERA Mission Authority — Minimal Persistence Design Proposal v0.1 (2026-10-01)

Status: design only. No SQL migration, RPC or hosted schema change.

## Evidence now available

The isolated Controlled Adapter tests are part of the Web build gate. Commit 5934c5b266a5137db9513502fe610f606bf26cfd received successful Vercel build statuses, and the build script at that commit executes npm test before next build. This is execution evidence for the current Web test suite, but not PostgreSQL concurrency evidence.

The Development catalog reconciliation shows that the existing mission tables do not persist authority revision, lease, exact approval binding, execution attempt/idempotency state, or atomic budget reservation.

## Candidate persistent primitives

### 1. Authority grant / revision state
One current authoritative record per mission revision should carry:
- tenant/principal/mission identity;
- authority revision and mission version;
- status, not-before and expiry;
- revocation state/reference;
- agent binding;
- policy version;
- allowed/denied action scope;
- allowed destinations/audience;
- action and spend limits plus consumed counters;
- current execution lease identity and expiry, only if the lease is intentionally mission-scoped.

### 2. Exact approval state
Approval must be independently durable and bind:
- approver/principal;
- mission + authority revision;
- action + action version;
- input hash;
- destination/audience;
- expiry and active/revoked state.

A generic approval flag is insufficient.

### 3. Execution attempt state
Every side-effecting dispatch needs:
- server-generated attempt id;
- tenant/mission/action/version;
- authority revision + lease id;
- input hash;
- audience/destination;
- idempotency key with a database-enforced uniqueness rule;
- decision and stable reason code;
- NOT_SENT / ACCEPTED / SUCCEEDED / FAILED / UNKNOWN state;
- receipt/reference;
- reconciliation state/timestamp;
- created/updated timestamps.

## Atomic authorization/dispatch fence

The production transaction must, at minimum:

1. Lock/read the authoritative mission authority record.
2. Re-check tenant, mission/action/version, revocation, expiry, lease, policy, approval, destination and input hash from authoritative state.
3. Reject replay by the durable idempotency uniqueness rule.
4. Atomically reserve the action/spend budget with a conditional update.
5. Insert the execution attempt/ALLOW correlation in the same transaction.
6. Commit the transaction before the external side effect.
7. Dispatch only through the controlled worker adapter.
8. Persist the external result or UNKNOWN state.
9. Reconcile UNKNOWN before any retry.

A database constraint or transaction failure must fail closed.

## Concurrency proof required before migration

Two independent PostgreSQL sessions must race the same remaining budget and the same/different idempotency keys. The evidence must show:
- at most one ALLOW for one remaining action budget;
- no duplicate attempt for one idempotency key;
- changed authority revision/action/input/destination cannot reuse an existing key;
- revocation/expiry wins even when a stale worker races dispatch.

This is a separate proof from the Web unit tests.

## Compatibility

Existing mission/action/history tables remain authoritative for their current responsibilities. New security state should reference them rather than overload their existing columns. Existing append-only history and auth.users -> private.handle_new_user_profile binding must remain intact.

No production schema object is proposed by this document.


## Evidence update — 2026-10-11 (W43–W66)

This remains a **design-only** proposal. Read-only catalog inspection was repeated against hosted ZAVQERA Development on 2026-10-11; no hosted schema or grants were changed.

### Existing primitives now available (W43–W66)

The feature branch and current Development schema now include a durable `public.agent_executions` ledger; workspace-scoped idempotency uniqueness; execution lease/recovery fields; W56/W60 replay/request binding; W57–W60 expiring exact approval scopes and consumption tombstones; W61/W62 bounded and redacted payload previews; W63 trusted-only generic completion with receipt/lease guards; W64 a narrow explicitly unverified read-only research completion path; and W65 direct-write revocation for client roles.

W66 further removes direct table privileges from `service_role` so a leaked service key cannot bypass W63 solely through direct DML. **W66 is currently only in the PR branch, not the hosted Development migration registry**. The W21 run on HEAD `95fcbb5ee64548e2e5b4117284474c9ff0e34b01` replayed the repository migrations, but the workflow did not yet copy or invoke the dedicated W66 pgTAP file. Thus no W66-specific test pass is claimed from that run. The read-only hosted privilege catalog still shows direct service_role table grants. No remote change was made.

### Evidence boundary for W25

W25 runs a two-session test over dedicated disposable harness objects named `authority_state` and `execution_attempts`, using a test-only `authorize_attempt()` function. It successfully demonstrates one ALLOW for one remaining budget unit, unique idempotency, changed-binding refusal, UNKNOWN replay hold, revocation, expiry, destination and input-hash mismatch **inside that harness**.

It does **not** yet prove that the app's current `public.start_agent_execution` RPC and `public.agent_executions` table atomically reserve Mission Authority action/spend budgets, or that the reservation is held across the external dispatch/receipt crash window. The current persistent ledger lacks dedicated normalized budget-counter/reservation fields for the full provider-neutral contract. JSON request and approval-scope bindings are useful protections but should not be presented as a universal JIT gate.

### Remaining proof, before any schema migration

W67 has completed the actual-ledger idempotency part on candidate HEAD `c1ce23840f442edcf7a84149f34e7b8b3ba460f4`: two independent PostgreSQL sessions called `public.start_agent_execution` against the disposable W21-migrated Supabase schema. Exactly one same-key attempt row and one start event remained; the losing session returned `EXECUTION_ALREADY_EXISTS`; replay and changed request content under the same key were refused. See https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577786.

The remaining design and evidence tasks are narrower now:

1. **Atomic budget reservation is still MISSING.** The actual ledger has no dedicated action/spend reservation counters to atomically coordinate concurrent starts. W67 explicitly reported `W67_BUDGET_RESERVATION=NOT_TESTED`; do not infer budget proof from idempotency.
2. Design the smallest durable authority-budget row or equivalent invariant, scoped to workspace/mission/agent/authority revision. It must carry the current revision/status/validity, action limit with reserved/consumed counts, and spend limit with reserved/consumed amount/currency. Avoid overloading `workspace_agents.authority` JSON as a concurrency counter.
3. A future guarded start/claim transaction must lock the current authority and mission/agent records in a consistent order, reject stale/revoked/expired/mismatched authority, reject duplicate idempotency keys, conditionally reserve action/spend budget, and insert the attempt under the same transaction. If this cannot be tested as one atomic fence, do not enable a real dispatch.
4. Specify when reservations are settled or released. UNKNOWN must keep the reservation held until authoritative reconciliation. A success must require trusted receipt evidence; a retry must require confirmed safe-to-retry evidence plus fresh authorization.
5. Prove one remaining action unit and one remaining spend budget cannot authorize two independent concurrent workers in disposable PostgreSQL 17. Separately race expiry/revocation against the same actual start/claim boundary. Never call hosted Development or real providers for these E2E tests.
6. Keep the universal JIT dispatch boundary, independent provider-side reconciliation and real external-effect verification as explicit blockers until a first real provider adapter is reviewed and tested.

W66's dedicated pgTAP test is now wired into W21 and passed on the later candidate; W66 is still only in the PR branch and was not applied to hosted Development. All six automated gates passed on HEAD `c1ce23840f442edcf7a84149f34e7b8b3ba460f4`; W21's W67 markers and teardown evidence are recorded in the run above.


**No new schema/RPC is approved by this design update.** Keep issue #25 open until actual-ledger concurrency evidence is attached. PR #29 stays OPEN / Draft / UNMERGED; Supabase Main/Production and hosted Development remain unmodified.


## W67 evidence and remaining budget-fence design — 2026-10-11

W67 is a provider-free test of the real persisted start RPC. It establishes concurrency/replay behavior for a single idempotency key in `public.agent_executions`, not action/spend consumption. This is an important narrow proof, not production authorization certification. Do not mark issue #25 complete until the actual authority-budget row/counter and dispatch fence have an independent-session proof.

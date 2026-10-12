# ZAVQERA Mission Authority Contract v0.1

**Status:** Draft contract for review; documentation only.  
**Target:** Provider-neutral domain/application boundary.  
**Baseline reviewed:** `V0_7_CRYPTOGRAPHIC_AUTHORITY_PASSPORT.md`, `V1_0_MISSION_RUNTIME_CONTRACT.md`, `V1_2_MISSION_RECOVERY_CRASH_SEMANTICS.md`, `V1_3_EXTERNAL_EXECUTION_PROTOCOL.md`, `V1_5_MISSION_POLICY_ENGINE.md`, and `MISSION_LEDGER_CONTRACT.md`.  
**Change boundary:** No schema, RPC, application-code, hosted-environment, or billing changes are part of this document.

## 1. Purpose and authority model

A Mission Authority decision determines whether one exact proposed action may cross a controlled execution boundary now. Authority is the intersection of the human-approved mission intent, active delegation, authority passport, current policy, action revision, execution lease, budget, and any required approval.

`Principal → Mission Contract → Delegation / Authority Passport → Policy + Risk + Approval → JIT Decision → Controlled Adapter → External System → Evidence → Verification → Outcome`

No agent, model, planner, client, envelope, checkpoint, or provider response may create or expand authority. An invocation envelope transports approved intent; it is not itself permission. Client-side checks are advisory. The enforcing server/adapter boundary must make the final decision immediately before external I/O.

## 2. Contract identity and required bindings

The logical contract is provider- and storage-neutral. These are semantic fields, not a finalized wire format or a claim that all fields are persisted today.

### Authority scope
- `contract_version`: this specification version.
- `organization_id`, `principal_id`, `mission_id`: required ownership/tenant bindings.
- `delegation_id`, `passport_id`, `authority_revision`: reference the approved grant and its revision.
- `mission_version`: the authoritative mission version used for this decision.
- `status`: active, suspended, revoked, or expired; only active can proceed.
- `issued_at`, `not_before` (optional), `expires_at`: explicit validity interval.
- `audience`: exact adapter/service boundary allowed to consume the decision.
- `agent_binding`: selected agent/runtime identity; provider replacement cannot broaden scope.
- `allowed_actions`, `denied_actions`: structured action/resource constraints; explicit deny overrides allow.
- `allowed_resources`, `allowed_destinations`: normalized resource and destination constraints, not free-form descriptions alone.
- `max_actions`, `max_spend`, `currency`: bounded usage and spending constraints where relevant.
- `approval_rules`: actions requiring named human approval, with approval bound to the exact proposed action.
- `success_criteria`: the approved, independently verifiable business result; a model's assertion is not evidence.
- `revocation_reference`: pointer to authoritative current revocation state, not a stale claim embedded in a portable document.

### Exact action binding
Each authorization attempt must bind:
- `action_id`, `action_version`, `input_hash`;
- `execution_attempt_id`, active `lease_id` and lease expiry;
- `idempotency_key` for every side-effecting call;
- `policy_version` and the current authorization decision;
- the exact audience/destination and normalized resource identifiers.

A changed action version, input hash, mission version, destination, policy-relevant constraint, or authority revision invalidates the previous decision and requires re-evaluation. Sensitive scope changes require fresh approval/delegation; they must never be silently accepted as a retry.

## 3. Decision procedure — fail closed

Immediately before external I/O, the enforcing boundary MUST:

1. Authenticate the calling principal/worker and resolve current organization and mission ownership from authoritative state.
2. Load the current mission, delegation, passport status/revocation, action revision, lease, budget counters, policy version, and approval state. Do not trust values supplied only by the client or model.
3. Verify exact tenant, mission, action/version/input hash, audience, destination/resource, agent-binding rules, validity window, and active lease.
4. Reject missing, malformed, stale, expired, revoked, replayed, mismatched, or unverifiable inputs.
5. Apply policy deterministically: explicit deny overrides allow; no matching rule means deny; approval-required without an exact valid approval means require approval; only explicit allow proceeds.
6. Check remaining action/spend limits atomically with the authorization/lease fence. Concurrent attempts must not both consume the same remaining budget.
7. Record a durable decision/attempt correlation before dispatch where the storage/adapter design supports it. The record must identify allow/deny/approval-required and the reason code, without secrets.
8. Dispatch only through the controlled adapter. If a relevant fence cannot be enforced atomically or immediately before dispatch, stop rather than claim strict enforcement.

A portable signed passport, even if cryptographically valid, does not override current revocation, policy, lease, or server state. The existing v0.7 development HMAC signer is not a production trust mechanism.

## 4. Decision results

Use stable semantic outcomes independent of a particular database or provider:
- `ALLOW`: all checks pass and the exact action may be dispatched once through the controlled boundary.
- `DENY`: a binding, scope, policy, lease, validity, identity, budget, or integrity check fails.
- `REQUIRE_APPROVAL`: the policy requires a new or renewed approval bound to this exact action.
- `RECONCILE_REQUIRED`: a prior external attempt may have happened and its outcome is unknown; do not resend.
- `RETRYABLE_NOT_SENT`: retry may be considered only with durable proof that no side effect crossed the adapter boundary, and after fresh authorization.

Decision records are not proof of execution success. External receipts are not automatically proof of business outcome.

## 5. Approval, revocation, and changes

- Approval must bind the principal/approver, mission and authority revision, action/version, input hash, destination/resource, decision context, and expiry.
- An approval for one action must not approve a modified action or a future unrelated attempt.
- Revocation is checked against authoritative current state at the execution boundary; cached or portable state alone is insufficient.
- A provider/model/worker change may preserve an existing delegation only when all authority bindings remain identical and policy permits the rebind. A change of scope requires a new revision and, when required, fresh approval.
- Expiry, cancellation, suspension, mission-version change, lease loss, or policy-version change forces re-evaluation; do not continue from a stale checkpoint.
- Budgets and action counts must be enforced atomically by the authoritative boundary, not merely estimated by the agent.

## 6. External effects, retries, and outcome

A side-effecting action requires a stable idempotency key. The adapter records the attempt and correlates provider receipt/reference where available.

- Proven not sent: re-authorize before considering retry.
- Accepted or execution reported successful: verify the intended business result independently.
- Failed: retry only if provider semantics, idempotency, current policy, and fresh authorization permit it.
- Unknown after a timeout/crash: mark unknown and reconcile against the external system before any retry or outcome commit.
- Missing verification never means success. Commit an outcome only after the applicable verification contract passes.

The ledger is append-oriented. Record authorization, approval, lease, dispatch, receipt, reconciliation, verification, and outcome facts without rewriting history or storing credentials/secrets.

## 7. Threat cases that must be tested

| Case | Required result |
|---|---|
| Agent/model replaced, same mission | Same or narrower authority only; never implicit expansion |
| Action input or destination changed after approval | Deny or require new approval |
| Stale mission/action/policy revision | Deny; refresh and re-authorize |
| Expired/revoked passport or lease | Deny |
| Missing policy or missing required approval | Deny / require approval; no dispatch |
| Two concurrent attempts compete for one remaining budget unit | At most one may be authorized |
| Duplicate request with same idempotency key | No duplicate external side effect where adapter/provider supports idempotency |
| Timeout after possible dispatch | Reconcile required; no blind retry |
| Forged client-side “ALLOW” or model assertion | Ignore; server recomputes the decision |
| Adapter path bypassed or destination outside controlled boundary | Do not claim enforcement; block launch of that integration until the path is controlled |
| Verification absent or fails | No successful outcome commit |
| Cross-tenant identifiers | Deny without disclosing another tenant's data |

## 8. Current implementation/evidence status

This section deliberately distinguishes documents and static review from verified runtime enforcement.

### Existing documented contracts
- v0.7 Authority Passport defines claim semantics, deny-over-allow, revision binding, expiry, revocation, and the explicit limitation of the development HMAC signer.
- v1.0 Mission Runtime Contract defines version-fenced transitions, no authority expansion during replanning, and verification before completion.
- v1.2 Recovery Contract requires reconciliation after uncertain external effects.
- v1.3 External Execution Protocol binds mission, authority, action revision, lease, idempotency key, and input hash; the envelope is not authority.
- v1.5 Mission Policy Engine defines fail-closed decisions and explicitly states that its Dart implementation is not the production authorization boundary.
- Mission Ledger Contract defines append-oriented, tenant-bound, authority- and evidence-aware history.

### Verified from the Development schema inventory (read-only)
- Development has seven application-owned public tables, RLS enabled on all seven, 18 policies, 13 triggers, and five intended authenticated mutation RPCs reviewed for ownership checks, fixed search paths, and versioned row locks.
- The five RPCs are not evidence that a general external-agent JIT enforcement gateway exists. Static review is not concurrency testing or proof of an external adapter boundary.
- The actual `auth.users` trigger calls `private.handle_new_user_profile()`; a separate public function is not the hook target and must not be substituted in a schema snapshot.

### Not yet established by the evidence reviewed for this contract
- A production-grade server-side JIT authorization gateway covering every external side effect.
- Production asymmetric signing, key rotation, replay/nonce protection, or a complete revocation service.
- Atomic cross-attempt budget reservation and concurrency/TOCTOU guarantees at a live external execution boundary.
- A real provider adapter with independently reconciled receipts and business outcomes.
- **Isolated authenticated browser E2E and cleanup evidence now PASS in CI** on 2026-10-11 (W21 run `38127303140`): disposable PostgreSQL 17 migration replay, pgTAP, AI quota/plan/workspace security checks, full Chromium E2E, disposable-stack cleanup verification, and diagnostics/evidence uploads all succeeded. This verifies the CI harness and covered scenarios; it does not prove universal external side-effect enforcement or live provider delivery.

Therefore v0.1 is a **design contract and acceptance baseline**, not a statement that the authority layer is implemented, production-secure, or universally enforced.

## 9. Acceptance gates before claiming enforcement

1. Review this contract against the exact source branch and existing contracts; resolve naming/semantic conflicts before implementation.
2. Define the smallest provider-neutral authorization-decision interface and stable reason codes without adding database objects yet.
3. Implement or identify the single controlled server/adapter boundary that all external side effects must traverse.
4. Add positive, negative, stale-revision, revocation, approval, concurrency/budget, replay/idempotency, unknown-result reconciliation, and cross-tenant tests.
5. Run the isolated local authenticated E2E with two users and verified teardown; do not run it against hosted Development.
6. Demonstrate at least one external adapter with a test double first, then one real integration after credentials, scope, and rollback/reconciliation are reviewed.
7. Only after the acceptance evidence exists, propose any required schema/RPC changes as a separate reviewed migration. Keep Supabase Main, protected PRs, billing, and production deployment untouched absent explicit authorization.

## 10. Compatibility rule

This document adds no schema and defines no database migration, RPC name, cryptographic wire format, or provider-specific API. Where it appears to conflict with an existing versioned contract, do not silently change the older contract; record the discrepancy and review it before implementation.


## Evidence addendum — 2026-10-11 — HEAD `154868ba51eea357f63af07186a511e483b83199`

The following automated gates passed on this exact branch HEAD:

- Web Unit: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38127303166
- Web CI / TypeScript / production build: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38127303134
- Flutter CI: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38127303128
- W25 isolated PostgreSQL atomic fence: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38127303101
- W21 Local Launch Gate: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38127303140
- Netlify Deploy Preview workflow: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38127303092

W21 evidence:
- Browser diagnostics artifact (screenshots and E2E log): https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38127303140/artifacts/11697673827
- Disposable-run evidence and cleanup proof: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38127303140/artifacts/11697449113

This evidence does not change the authority contract's implementation status. The current controlled adapter has additional input-budget validation and exact approval audience/policy-version binding tests, but the universal provider-neutral just-in-time enforcement boundary across every external side effect remains **NOT ESTABLISHED**. Authenticated hosted Mission Research/citation/history persistence and real Resend invitation delivery remain **NOT VERIFIED**. Supabase Development still reports `auth_leaked_password_protection` **WARN / Disabled**. PR #29 remains OPEN / Draft / UNMERGED; Supabase Main/Production remains untouched.


## Implementation status matrix — 2026-10-11

This is a source-and-test evidence review of the current PR candidate, not a production certification. “Implemented” below is scoped to the named boundary; it must not be generalized to every provider or worker.

| Invariant | Status | Source / evidence | Remaining limitation |
|---|---|---|---|
| Authenticated workspace/mission/agent/action binding at execution start | **PARTIAL** | `supabase/migrations/20261008152500_w43_bounded_agent_execution_runtime.sql`; `supabase/migrations/20261010125620_w56_agent_execution_duplicate_dispatch_guard.sql`; `supabase/tests/w57_exact_agent_approval_binding.sql` | Workspace scope is checked, but this is not a universal organization/principal/delegation passport boundary for every external adapter. |
| Exact, expiring agent-execution approval | **IMPLEMENTED for the current PostgreSQL RPC contract** | W57–W62 migrations; `supabase/tests/w57_exact_agent_approval_binding.sql` | Must be preserved by any future adapter; a generic mission/action approval is not execution permission. |
| Approval consumption cannot be restored by deleting an execution | **IMPLEMENTED for the current SQL contract** | `supabase/migrations/20261010180000_w58_retry_replay_and_consumption_tombstone.sql` | Does not by itself reconcile a real provider's outcome. |
| Exact request binding and duplicate-dispatch refusal | **IMPLEMENTED for the current SQL contract** | W56 and `supabase/migrations/20261010183000_w60_start_idempotency_request_binding.sql` | Existing attempts must be reconciled; the RPC intentionally does not authorize a resend. |
| Bounded, value-free approval payload preview with sensitive field-name redaction | **IMPLEMENTED for the current SQL preview** | W61/W62; `supabase/tests/w57_exact_agent_approval_binding.sql` | Field-name redaction is defense in depth, not a guarantee that arbitrary business context is non-sensitive. |
| One provider-neutral JIT decision immediately before every delegated external side effect | **PARTIAL — guarded dispatch path exists; real provider remains disabled** | W69 `claim_agent_execution_dispatch`; `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs`; `apps/web/app/api/internal/agent-executions/[executionId]/route.ts`; W21/W69 tests | The provider registry is intentionally empty, so no reviewed provider adapter is callable and no real external side effect is enabled. Universal coverage must be preserved for every future adapter. |
| Atomic action/spend budget across independent workers at the actual dispatch boundary | **PARTIAL / real-provider coupling NOT PROVEN** | W68 atomic reservation/settlement; W69 one-time dispatch claim; W25 independent PostgreSQL fence; W21 actual-ledger race tests | Budget and JIT checks are atomic inside their SQL boundaries, but no real provider network send is currently wired to prove end-to-end crash/race behavior across the external dispatch boundary. |
| Durable attempt journal and UNKNOWN state | **PARTIAL — durable reconciliation contract exists** | `public.agent_executions`; W49/W56 recovery and replay guards; W70 reconciliation claims and authoritative settlement | The database has leased reconciliation and held-budget settlement, but a real provider lookup/receipt contract has not been certified end-to-end. |
| Unknown provider outcome blocks blind retry | **IMPLEMENTED for guarded SQL paths; provider lookup remains unverified** | W56–W60 and W70; controlled-adapter regression tests; W21 disposable PG17 suite | The state machine blocks blind retries and supports durable reconciliation, but no real provider lookup adapter is registered. |
| Verification before business outcome commit | **PARTIAL** | Existing verification/outcome RPCs and lifecycle tests | No real external-effect integration has been proven end-to-end through dispatch, receipt, independent verification and outcome. |
| Provider/model substitution cannot expand authority | **PARTIAL** | Controlled-adapter tests bind action/input/destination and fail closed | Tests exercise the isolated prototype, not every production adapter entry point. |
| Cross-tenant denial and no client-supplied authority | **IMPLEMENTED for covered SQL/web boundaries** | W21 disposable PostgreSQL/security suite; W57 pgTAP; Web authorization tests | Continue to require the same checks in every new endpoint and adapter. |

### Next implementation gate

Do not add more schema or RPCs merely to complete the matrix. The next gate is to review and register one provider adapter only after its exact receipt, idempotency and authoritative-reconciliation contract is defined and tested. Exercise timeout-after-send, definite-no-send, duplicate delivery, late worker completion and concurrent budget/claim races. Keep the registry empty and external dispatch disabled until these cases are proven for that provider.

Hosted authenticated Mission Research, real Resend invitation delivery, human visual QA, and Development leaked-password protection remain separate release gates. PR #29 stays OPEN / Draft / UNMERGED; Supabase Main/Production and production deployment remain untouched.


## W66/W67 execution-boundary evidence — 2026-10-11

- **W66:** its dedicated pgTAP test is now wired into the W21 local launch gate and passed on the branch candidate. The migration removes direct `service_role` table grants on `public.agent_executions`; it has not been applied to hosted Development, whose read-only catalog still showed those grants.
- **W67:** the disposable W21 run invoked the actual `public.start_agent_execution` RPC from two independent sessions. Same-key concurrency left one attempt row and one start event; replay returned `EXECUTION_ALREADY_EXISTS`; altered request contents under that key returned `EXECUTION_IDEMPOTENCY_BINDING_MISMATCH`. Evidence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577786.
- **Still missing:** the runtime schema has not established an atomic action/spend budget reservation at that same boundary. W67 explicitly says the budget check was not tested. Universal provider-neutral JIT enforcement, real-provider reconciliation, hosted Research/citations/history, real Resend inbox delivery, and human visual QA remain separate release acceptance items.

The candidate HEAD `c1ce23840f442edcf7a84149f34e7b8b3ba460f4` passed Web Unit, Web CI/build, Flutter CI, W25, Netlify Preview verification and W21. This is automated candidate evidence, not production launch approval.


## W68–W70 follow-up evidence — 2026-10-12

Verified candidate HEAD: `cb0d4fbffad55695d8b4f1b9282f4d19757e4112`. This section supersedes earlier status notes about the missing persistent UNKNOWN-outcome reconciliation contract; it does not certify a real provider integration.

- **W68 — persistent action/spend reservation:** the actual PostgreSQL ledger was raced from independent sessions. The test verified that action and spend reservations are atomic and cannot oversubscribe the same budget.
- **W69 — one-time JIT dispatch claim:** the actual ledger race produced exactly one dispatch claim and rejected the concurrent claimant.
- **W70 — durable UNKNOWN-outcome reconciliation:** a service-role-only RPC issues a five-minute reconciliation lease/token for an UNKNOWN external execution with a HELD_UNKNOWN reservation. A second concurrent worker is rejected. Finalization requires the matching unexpired token and authoritative lookup evidence; success requires a meaningful provider receipt and settles the held budget once, while failure releases it only when the trusted adapter proves the request was not sent and retry is safe. Over-cap charges leave the execution UNKNOWN and the reservation held. Exact success and no-send replay are idempotent.
- **Provider-neutral gateway:** `reconcileThroughTrustedClaim` performs a lookup-only adapter call; it never calls `dispatch`. The gateway preserves `charge_amount` and `currency` through receipt sanitization, while rejecting negative amounts and malformed currencies.

### Updated acceptance boundary

The SQL contracts and provider-neutral gateway seam are now implemented and tested, including actual-ledger concurrency. The overall production JIT boundary remains **PARTIAL**, because neither `dispatchThroughJitClaim` nor `reconcileThroughTrustedClaim` is wired into a single production server worker that owns a real provider adapter. No live provider call was enabled.

Hosted authenticated Mission Research, real Resend inbox delivery, human visual QA, and Development leaked-password protection remain separate release gates. Keep PR #29 OPEN / Draft / UNMERGED and keep Supabase Main/Production and production deployment untouched.


## Provider adapter audience binding — 2026-10-12

The persistent W69/W70 gateway now requires each trusted provider adapter to declare its stable `audience` identifier. Before dispatch or provider lookup, the gateway compares that identifier with the audience bound into the claimed execution request. A mismatch is fail-closed: dispatch is recorded as not sent and settled as BLOCKED, or reconciliation remains UNKNOWN without a provider lookup. This prevents a queue/event hint or adapter selection error from sending an approved request to a different provider integration.

Regression coverage: `apps/web/test/persistent-dispatch-gateway.test.mjs` now tests both dispatch and reconciliation audience mismatch. The gateway remains a tested server-side seam only: no production worker or real side-effect provider is wired, and no live external dispatch is enabled. W21 on the prior exact HEAD `a3fc4e96edc810c829e0d71fc4c1f3666bcac3b7` passed all database, concurrency, browser, and cleanup gates; this change must pass its own new CI run before it is accepted.


## Trusted worker ingress scaffold — 2026-10-12

Added a server-only worker ingress at `POST /api/internal/agent-executions/[executionId]`. It requires a timing-safe, exact Bearer token from `ZAVQERA_EXECUTION_WORKER_TOKEN`, accepts only a bounded provider audience selector, and uses a server-only Supabase service-role RPC client. The route never accepts a provider adapter or execution payload from the request body.

**Intentionally fail-closed:** `provider-adapter-registry.mjs` is empty until a real provider adapter has passed review. With no registered adapter, the endpoint returns HTTP 503 before constructing the privileged database client or claiming an execution. No provider call is enabled by this scaffold. When an adapter is eventually registered, the existing persistent gateway must still validate the database JIT claim and exact audience before its single dispatch call.

The service-role client is isolated in `apps/web/lib/supabase/admin.ts` with the Next.js `server-only` guard. The worker token validator and empty registry have dedicated tests. This is a protected worker ingress, **not** proof of a live provider integration or autonomous queue/scheduler. Production dispatch remains disabled until a reviewed adapter, privately configured secrets, and exact-head CI/E2E evidence exist.


## Reconciliation freshness fence — 2026-10-12

A trusted reconciliation worker must not settle an UNKNOWN attempt using provider evidence whose `checked_at` predates the durable dispatch claim (or execution creation time for legacy attempts without a W69 claim). W70 enforces this in PostgreSQL, and the provider-neutral gateway independently rejects stale lookup timestamps before finalization. Regression coverage verifies stale evidence leaves the execution UNKNOWN and its `HELD_UNKNOWN` budget reservation unchanged.

This is a freshness/replay defense, not proof that a provider timestamp is truthful. Production adapters must query the authoritative provider using the exact idempotency key or receipt and return a trustworthy lookup timestamp. No real provider adapter is wired or enabled by this change.


## Unified trusted worker operation — 2026-10-12

The internal worker ingress is now a single endpoint at `POST /api/internal/agent-executions/[executionId]` with a minimal body containing only `operation` (`dispatch` or `reconcile`) and the provider `audience`. It routes to the existing JIT dispatch or durable reconciliation gateway, rejects extra body fields, validates the execution UUID, and fails closed before creating a privileged client when no reviewed adapter is registered or when reconciliation is unsupported.

The old dispatch-only route was removed so dispatch and reconciliation share the same worker authentication and server-only service-role boundary. The registry remains empty by design; this change does not enable live provider calls.


## Exact-head validation snapshot — 2026-10-12 — code HEAD `990f48b714d60cf97d3288aba5ab6cfe7b66578d`

The following checks completed successfully on the code HEAD named above, before this documentation-only update:

- Web Unit: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38209185306
- Web CI / TypeScript / production build: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38209185291
- Flutter CI: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38209185285
- W25 isolated PostgreSQL atomic fence: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38209185293
- Netlify Deploy Preview verification: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38209185319
- W21 Local Launch Gate: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38209185284

W21 included PostgreSQL 17 migration replay, the core pgTAP launch gate, the newly wired W63/W64/W65/W66/W68/W69/W70 Mission Authority SQL regressions, AI quota/plan/workspace security tests, four actual-ledger concurrency/race proofs, and 2/2 browser E2E scenarios. Cleanup was verified; evidence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38209185284/artifacts/11728242645 and browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38209185284/artifacts/11728332228.

This is automated candidate validation, not production approval. The provider registry remains empty. Hosted authenticated Research, real Resend delivery, human visual QA, Development leaked-password protection, and a reviewed real-provider adapter/reconciliation contract remain release gates. PR #29 remains OPEN / Draft / UNMERGED; Supabase Main/Production and production deployment remain untouched.


## W71 stale external-execution recovery — 2026-10-12

- Fixed a recovery handoff defect between W49 and W70: an expired `RUNNING` execution with `external_side_effects=true` is now changed to `UNKNOWN` only after its existing `RESERVED` budget reservation is locked and moved to `HELD_UNKNOWN`. Reserved/consumed action and spend counters do not change. Mission-history evidence records the hold.
- If the reservation is absent, closed, or inconsistent with budget counters, recovery fails closed without changing the execution to `UNKNOWN`; it must not create the appearance that the budget can safely be retried.
- Added a PostgreSQL 17/pgTAP regression that recovers an expired external attempt, verifies counters stay held, and proves the W70 trusted reconciliation claim can then be acquired. A negative case proves missing reservation remains `RUNNING` rather than silently dropping the budget fence.
- The web gateway now validates the execution lease expiry against the current wall clock before invoking the provider adapter. An expired claim never reaches provider I/O; if its BLOCKED settlement cannot be confirmed because the lease has expired, the gateway returns reconciliation-required rather than retrying.
- The provider registry remains intentionally empty. These controls improve the future adapter boundary but do not certify any real provider or authorize production dispatch.


## W73 trusted system mission-event boundary — 2026-10-12

The W72 disposable PostgreSQL integration exposed a role/identity mismatch: the trusted service worker correctly calls JIT claim/completion/reconciliation RPCs using `service_role`, which has no end-user `auth.uid()`. The legacy mission-event writer required a user identity and therefore rejected an otherwise valid trusted claim while appending its audit event.

W73 updates only the private mission-event implementation; it does not change hosted schemas or enable a provider. The writer now has two distinct audit paths:

- **Trusted system events:** a small explicit allowlist; execution ID must resolve to an execution in the exact mission; dispatch events must match persisted claim time, authority/request hashes and budget revision; completion/reconciliation events must match persisted state. These events use `actor_type='SYSTEM'` and `actor_id=NULL`, with the owner resolved from the mission.
- **User events:** authenticated actor attribution is retained. Owners and authorized workspace editors can append ordinary user events. Generic completion events are allowed only for the W64 unverified read-only research path, and W71 stale-recovery events remain bound to the exact UNKNOWN execution, owner/admin role, and held budget reservation. Users cannot forge trusted dispatch/reconciliation event types.

The W73 pgTAP test is wired into the disposable PostgreSQL 17 W21 regression sequence before the W72 fake-provider integration. The implementation is not considered verified until W21 and the other gates complete on the resulting exact commit.


## W73 / W72 exact-head validation — 2026-10-12 — `43cb98715948e41a4a7c1cb96ef68f034a2ff191`

All six automated candidate gates passed on the same code HEAD:

- Web Unit — **PASS, 302/302 tests**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38224308948
- Web CI / TypeScript / production build — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38224308864
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38224308907
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38224308866
- Netlify Deploy Preview verification — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38224308838
- W21 disposable PostgreSQL 17 launch gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38224308835

W21 replayed migration history, passed the W63/W64/W65/W66/W68/W69/W70/W71/W73 Mission Authority pgTAP regressions and AI quota/plan/workspace authorization tests, and passed four independent-session actual-ledger concurrency proofs (idempotency, atomic budget reservation, one-time dispatch claim, and reconciliation claim). The W72 persistent gateway integration with fake providers passed:
`W72_PERSISTENT_GATEWAY_POSTGRES_INTEGRATION=PASS`,
`actual_postgres_success_and_budget_settlement=PASS`,
`unknown_to_no_send_reconciliation_without_redispatch=PASS`,
`durable_dispatch_and_reconciliation_audit=PASS`.
Browser E2E passed **2/2**. Disposable Supabase cleanup was verified with `supabase_stop_exit_code=0` and `cleanup_verified=true`.

Artifacts: [W21 evidence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38224308835/artifacts/11736140236) · [browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38224308835/artifacts/11736220113).

W73 resolves the specific W72 failure where a service-role worker could pass the JIT decision yet fail to append the mission audit event because the legacy writer required `auth.uid()`. System events now use a bounded allowlist and are checked against persisted execution state; regular user events preserve user attribution. The pgTAP test plan was corrected from 27 to 26 assertions before the final passing run.

This snapshot certifies the tested candidate code path with **fake providers only**. The provider registry remains intentionally empty. Hosted authenticated live Research/citations/history, real Resend inbox delivery and password-reset email, human desktop/mobile visual QA, and Supabase Development leaked-password protection remain open release gates. Production launch is **not approved**. PR #29 remains OPEN / Draft / UNMERGED; Supabase Main/Production, production deployment, DNS, billing, and real provider side effects remain untouched.


## W74 reconciliation evidence freshness hardening — candidate change

A persisted reconciliation claim is not enough on its own: the provider lookup's `checked_at` must be later than both the original dispatch attempt and the currently held reconciliation claim. This prevents a lookup captured before a worker claimed reconciliation from being reused as fresh evidence merely because it post-dates the original dispatch.

- The server-side gateway envelope carries the persisted `reconciliation_claimed_at` timestamp.
- The gateway fails closed before the outcome-settlement RPC if the lookup timestamp does not post-date this claim.
- The additive W74 migration repeats the freshness check after locking the execution and validating the active claim token/lease, so a caller cannot bypass the application-layer check.
- The W70 pgTAP regression suite verifies that the W74 guard keeps the execution `UNKNOWN`, reservation `HELD_UNKNOWN`, and claim token intact when evidence predates the active reconciliation claim. The gateway unit suite separately checks evidence which is newer than dispatch but older than reconciliation claim.

This is a candidate code hardening. The exact new commit must pass all CI gates before the release evidence is updated. It does not enable a real provider or modify hosted Supabase.


### Approved request immutability — candidate follow-up

The dispatch and reconciliation adapter envelopes are deeply frozen, including nested objects and arrays in the approved request. This prevents an adapter from accidentally or deliberately mutating the in-memory payload after the durable JIT claim has bound its hash. Regression tests assert nested mutation throws on both dispatch and reconciliation paths. This is a defence-in-depth control; the durable database hashes and provider request binding remain authoritative, and a provider registry stays empty until an adapter passes review.


### Provider registration contract — candidate follow-up

The static adapter registry remains empty. Registry resolution now fails closed unless a registered entry's audience exactly matches the requested audience and the entry implements both `dispatch` and `reconcile`. Dispatch-only registrations are rejected because an ambiguous external result could otherwise remain unreconcilable. The TypeScript adapter contract marks both methods as mandatory and exposes the claimed request as deeply readonly. This shape validation is only a guardrail: it does not constitute security review of a provider or authorize any real side effect.


## W75 correlatable provider receipt — candidate verified on 2026-10-12

**Implementation:** `supabase/migrations/20261012140000_w75_correlatable_provider_receipt.sql` adds a private SECURITY DEFINER trigger function on updates to `public.agent_executions`. If an execution with `authority_snapshot.external_side_effects=true` is marked `SUCCEEDED`, its `evidence.provider_receipt` must be an object containing a non-empty top-level scalar reference in one of the allowlisted fields: `id`, `reference`, `request_id`, `message_id`, `transaction_id`, or `operation_id`. String identifiers are limited to 500 characters; numeric identifiers are bounded. Status-only/provider-name-only/cost-only fields and nested IDs are not sufficient.

The persistent application gateway checks this same invariant for both immediate dispatch results and authoritative reconciliation results. An uncorrelatable success stays `UNKNOWN` and cannot be committed as final success; it requires further authoritative reconciliation. The trigger is limited to UPDATEs because authenticated/service worker table writes are already revoked and all supported starts create RUNNING attempts through guarded RPCs; existing immutable fixture/history inserts are not rewritten by this guard. The read-only W64 research path remains exempt because `external_side_effects=false`.

**Evidence:** `supabase/tests/w75_correlatable_provider_receipt.sql` passed in the disposable PostgreSQL 17 W21 gate. The test rejects status-only, provider-only and nested references, accepts a stable top-level string or numeric reference, and confirms read-only research is unaffected. Application regression tests cover three uncorrelatable receipt shapes in dispatch and reconciliation. Exact-head Web Unit passed 308/308 and all six PR gates passed at `179e9812fb1b787bd162b17a454cb4fdc1f57724`; run links are in the launch-gates status document.

This verifies the **fake-adapter candidate path**, not a real provider. The registered adapter set intentionally remains empty. No hosted migration was applied. Production readiness and external-provider authority remain blocked on the previously listed live Research/history, email delivery, visual QA and Development account-protection gates.

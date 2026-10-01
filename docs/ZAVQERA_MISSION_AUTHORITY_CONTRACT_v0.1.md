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
- Passing isolated authenticated browser E2E and cleanup evidence; the documented environment is blocked because Docker/native Supabase CLI are absent there.

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

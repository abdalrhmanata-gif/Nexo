# ZAVQERA Mission Authority decision interface v0.1 — proposal only

**Status:** Design proposal for review; not implemented and not a security certification.  
**Inputs reviewed:** Mission Authority Contract v0.1; NEXO v1.3 External Execution Protocol; v1.5 Mission Policy Engine; v1.6 JIT Authorization Decision Record; candidate W68–W80 migrations and the current server gateway.  
**Scope:** Provider-neutral request/result semantics and stable reason codes. This proposal makes no runtime, schema, SQL function, RPC, grant, hosted-environment or production-resource change.

## 1. Current vocabulary mismatch

The candidate currently has two overlapping vocabularies:

- `apps/web/lib/mission-authority/controlled-adapter.mjs`: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `RECONCILE_REQUIRED`, `RETRYABLE_NOT_SENT`.
- `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs`: `DENY`, `DISPATCHED`, `RECONCILE_REQUIRED`, `RECONCILED`, plus detailed `reasonCode` strings.

These represent different phases. `ALLOW` is an authorization decision; `DISPATCHED` and `RECONCILED` represent execution/recovery progress. A canonical interface must not conflate permission, provider result, and reconciliation outcome.

W68 reserves budget at execution start. W69 performs the JIT claim and reloads candidate authority, versions, approval, lease, audience/request bindings and reservation before provider I/O. W70 provides a leased UNKNOWN reconciliation path. These are candidate contracts tested on disposable PostgreSQL 17; this is not proof of hosted Development parity or universal coverage of all side effects.

## 2. Proposed narrow trusted request

```ts
type MissionAuthorityOperation = "authorize_dispatch" | "reconcile";

interface MissionAuthorityDecisionRequestV01 {
  contract_version: "zavqera.mission-authority-decision/v0.1";
  operation: MissionAuthorityOperation;
  execution_id: string; // existing durable attempt UUID
  audience: string;     // exact reviewed adapter audience
}
```

The authenticated worker identity must come from trusted server authentication. Principal, workspace/tenant, mission, action revision, input hash, authority revision/hash, approval, lease, policy, budget and destination must be loaded and checked against authoritative state. Request fields, envelopes, model outputs, client-side ALLOW decisions and provider responses are not authority. Unknown or extra fields fail closed.

The current route accepts `dispatch` / `reconcile`; the names above are a **proposal**, not an instruction to change that route before separately reviewed implementation work.

## 3. Proposed normalized result

```ts
type AuthorityDecision =
  | "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "RECONCILE_REQUIRED";

type RecoveryClassification =
  | "NONE" | "RETRYABLE_NOT_SENT" | "UNKNOWN";

type ExecutionStatus =
  | "NOT_STARTED" | "DISPATCHED" | "ACCEPTED" | "SUCCEEDED"
  | "FAILED" | "UNKNOWN" | "RECONCILED_NOT_SENT";

interface MissionAuthorityDecisionResultV01 {
  contract_version: "zavqera.mission-authority-decision/v0.1";
  phase: "AUTHORIZATION" | "EXECUTION" | "RECONCILIATION";
  decision: AuthorityDecision;
  reason_code: string; // canonical catalogue below
  evaluated_at: string; // UTC RFC 3339
  valid_until: string | null; // mandatory and short-lived for ALLOW
  binding: {
    execution_id: string;
    workspace_id: string;
    mission_id: string;
    action_id: string;
    action_version: number;
    request_hash: string;
    authority_revision: number;
    authority_hash: string;
    budget_revision: number;
    audience: string;
    destination_hash: string;
    approval_id: string | null;
    lease_expires_at: string;
  };
  execution_status: ExecutionStatus;
  recovery: RecoveryClassification;
  evidence_ref: string | null; // opaque internal correlation reference
}
```

This is a target interface, **not** a claim that one current source or row already stores/returns every field. Some bindings exist in the candidate ledger/claim tuple; others remain unnormalized or are carried in JSON snapshots. First inventory the authoritative source for each field, then compare candidate and hosted signatures read-only before proposing any separate migration.

Rules:
1. `ALLOW` is valid only for the authorization phase, tied to the exact execution/request, and valid only until a short expiry. It permits at most one adapter call for the claim; it grants no standing authority.
2. `DENY` or `REQUIRE_APPROVAL` means no provider call.
3. `RECONCILE_REQUIRED` means lookup only under a fresh trusted reconciliation claim; never dispatch.
4. `RETRYABLE_NOT_SENT` is a recovery finding after authoritative no-send proof, **never permission** to retry. A retry needs fresh JIT authorization.
5. An uncertain claim, provider result, lookup or persistence outcome remains UNKNOWN/reconciliation-required. No blind retry and no successful business outcome without independent verification.
6. Keep HTTP responses `no-store`; do not expose raw SQL errors, provider bodies, secrets, payload values or cross-tenant existence in public reason codes.

**Compatibility gate:** Contract v0.1 currently lists `RETRYABLE_NOT_SENT` as a decision result, while v1.3 uses `NOT_SENT` as an execution result. This proposal separates authorization from recovery to remove ambiguity but does not silently rewrite either existing contract. Resolve this explicitly before integration.

## 4. Stable reason-code catalogue proposal

Canonical codes are provider-neutral upper snake case and should remain stable after release. Raw database messages and provider-specific error strings are internal diagnostics, not public reason codes. The mapping below covers observed candidate reasons; it is not yet a mechanically verified exhaustive inventory.

| Canonical code | Meaning / expected behavior | Existing candidate mapping |
|---|---|---|
| `REQUEST_INVALID` | malformed operation, reference or body; no side effect | HTTP/worker request gate |
| `TRUSTED_EXECUTOR_REQUIRED` | caller is not the trusted worker | SQL `TRUSTED_EXECUTOR_REQUIRED` |
| `DECISION_DEPENDENCY_UNAVAILABLE` | trusted config, DB or persistence could not be confirmed; fail closed | generic fallback for unknown dependency failures |
| `EXECUTION_NOT_FOUND` | no execution in permitted scope; disclose no cross-tenant existence | SQL `EXECUTION_NOT_FOUND` |
| `MISSION_CLOSED_OR_NOT_FOUND` | mission is absent in bound workspace or cannot execute | SQL `MISSION_CLOSED_OR_NOT_FOUND` |
| `EXECUTION_NOT_ELIGIBLE` | not in dispatchable state | SQL `EXECUTION_NOT_RUNNING`, `ACTION_NOT_EXECUTABLE` |
| `EXECUTION_CANCELLED` | cancellation has been requested | SQL `EXECUTION_CANCELLATION_REQUESTED` |
| `LEASE_EXPIRED_RECONCILIATION_REQUIRED` | lease expired; reconcile/recover, do not send | SQL `EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION` |
| `AUTHORITY_BINDING_CHANGED` | persisted agent/authority no longer matches attempt | SQL `AGENT_AUTHORITY_CHANGED` |
| `AGENT_NOT_FOUND_OR_FORBIDDEN` | agent absent or forbidden in scope | SQL `AGENT_NOT_FOUND_OR_FORBIDDEN` |
| `SIDE_EFFECT_SCOPE_REQUIRED` | explicit external-side-effect scope is missing | SQL `JIT_EXTERNAL_SIDE_EFFECT_SCOPE_REQUIRED` |
| `APPROVAL_REQUIRED_OR_SCOPE_CHANGED` | approval is absent or scope differs; fail closed and require review | SQL currently uses this deliberately ambiguous combined code; do not infer ALLOW |
| `APPROVAL_EXPIRED_REQUIRES_REAPPROVAL` | exact approval expired | SQL code of same name |
| `BUDGET_RESERVATION_NOT_OPEN` | budget reservation is not in expected state | SQL `EXECUTION_BUDGET_RESERVATION_NOT_OPEN` |
| `AUTHORITY_BUDGET_MISSING_OR_INACTIVE` | no active budget applies | SQL code of same name |
| `AUTHORITY_BUDGET_BINDING_MISMATCH` | budget does not match mission/agent/revision/attempt | SQL code of same name |
| `AUTHORITY_BUDGET_OUTSIDE_VALIDITY_WINDOW` | budget not yet active or expired | SQL `AUTHORITY_BUDGET_NOT_IN_VALIDITY_WINDOW` |
| `DISPATCH_ALREADY_CLAIMED` | one-time dispatch claim already consumed | SQL `EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH` |
| `DISPATCH_CLAIM_OUTCOME_UNKNOWN` | claim transaction result cannot be established | gateway code of same name |
| `INVALID_DISPATCH_GATEWAY_CONFIGURATION` | trusted dispatch dependencies are invalid | gateway code of same name |
| `PROVIDER_ADAPTER_UNAVAILABLE` | no reviewed adapter for exact audience | missing adapter; registry intentionally empty |
| `PROVIDER_OUTCOME_UNKNOWN` | send may have occurred; result is not proven | gateway code of same name |
| `PROVIDER_OUTCOME_REQUIRES_RECONCILIATION` | provider returned accepted/unknown or otherwise ambiguous result | gateway code of same name |
| `PROVIDER_RECONCILIATION_UNAVAILABLE` | approved authoritative lookup is absent | gateway code of same name |
| `AUTHORITATIVE_LOOKUP_EVIDENCE_REQUIRED` | lookup evidence not fresh/correlatable/authoritative | gateway code of same name |
| `PROVIDER_OUTCOME_STILL_UNKNOWN` | lookup could not settle state | gateway code of same name |
| `RECONCILIATION_ALREADY_CLAIMED` | another live claim owns reconciliation | SQL/gateway reconciliation-claim code |
| `RECONCILIATION_CLAIM_OUTCOME_UNKNOWN` | claim state cannot be confirmed | gateway code of same name |
| `RECONCILIATION_PERSISTENCE_UNCONFIRMED` | lookup could not be durably settled | gateway code of same name |
| `PROVIDER_RECEIPT_MISSING_OR_UNUSABLE` | success lacks a usable receipt | gateway `RECONCILED_SUCCESS_WITHOUT_USABLE_RECEIPT` |
| `PROVIDER_RECEIPT_UNCORRELATABLE` | receipt has no stable correlation reference | gateway `RECONCILED_SUCCESS_WITHOUT_CORRELATABLE_RECEIPT` |
| `COMPLETION_PERSISTENCE_UNCONFIRMED` | completion state was not durably confirmed | gateway code of same name |
| `PROVIDER_CONFIRMED_NOT_SENT` | provider authoritatively proves no send; fresh JIT still required | gateway code of same name |
| `ALREADY_RECONCILED` | terminal reconciliation already exists; inspect only | gateway code of same name |
| `PROVIDER_SUCCESS_RECONCILED` | success receipt found; business verification still required | gateway code of same name |
| `PROVIDER_NO_SEND_RECONCILED` | no-send proven; not permission to retry | gateway code of same name |
| `UNKNOWN_OUTCOME_REQUIRES_RECONCILIATION` | conservative fallback for unresolved outcome | gateway fallback code |
| `PRE_DISPATCH_BLOCK_SETTLEMENT_UNCONFIRMED` | denial/block could not be durably recorded; remain fail-closed | gateway code of same name |

Before runtime adoption, a test must enumerate **all** candidate gateway reason strings and SQL exception strings in W68–W80 and prove each maps explicitly. Unknown codes must fail closed to `DECISION_DEPENDENCY_UNAVAILABLE` without exposing raw details. Do not rename SQL/audit codes blindly.

## 5. Normalization and audit rules

- Public callers get only `reason_code`; internal sanitized evidence may retain source code and an opaque correlation ID.
- Adapters return typed results and map them to canonical reason codes; they cannot mint arbitrary public codes.
- Do not put provider names, payloads, URLs, credentials, SQL messages, tenant existence or user data into public reason codes.
- Keep bounded sanitized receipt evidence under existing receipt rules; expose only an opaque `evidence_ref` in the normalized result.
- Metrics are keyed by canonical code and phase. Missing/unknown reasons never mean ALLOW.
- A result object alone is not an immutable audit record. Persistence before external I/O and append-only evidence remain required where supported.

## 6. Implementation sequence (no schema changes in this step)

1. Review/freeze the vocabulary and explicitly resolve `RETRYABLE_NOT_SENT` and the combined approval code.
2. Add a pure server-side mapping from observed SQL/gateway values to the canonical catalogue. Unknown values fail closed.
3. Add tests enumerating every observed gateway reason and W68–W80 SQL exception code; unmapped values fail CI.
4. Add a pure normalizer keeping `decision`, `execution_status` and `recovery` separate. Do not replace existing paths until parity tests pass.
5. Compare candidate and hosted DB/RPC signatures read-only before any separately reviewed migration. This document does not justify a table/RPC by itself.
6. Keep the provider registry empty until timeout-after-send, idempotency, receipt correlation/authenticity, authoritative lookup, no-send proof, and fresh-JIT retry tests pass.

## 7. Decision

**PROPOSED / NOT INTEGRATED.** Web Unit 361/361, Web CI/typecheck/build, Flutter CI and W21 disposable PostgreSQL 17/browser/cleanup passed on validated runtime source head `1713ce57a09b092bdcc5c28d3c2be39776972c26`. The documentation-only head `84700b64a5e0cbc5d6f6d7b5909c554e54b8d9c3` also passed Web Unit, Web CI and Flutter CI. This evidence is not hosted Development parity or live-provider evidence.

Keep PR #39 Draft/unmerged, PR #29 unchanged, Issue #23 OPEN and the provider registry empty. Universal production egress mediation remains **NOT ESTABLISHED**; launch remains **NO-GO**.

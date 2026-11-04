# ZAVQERA Mission Action Egress Architecture v0.1

**Status:** Design-only proposal; not implemented, deployed, or production-certified.  
**Decision:** NO-GO for launch.  
**Scope:** External side effects initiated as Mission Actions. Other outbound effects (AI planning/research, account/session verification, invitation email, password-range lookup, and similar app functions) must be inventoried and governed explicitly, but must not be mislabeled as Mission Action dispatch.

## 1. Invariants

1. A client, model, plan, adapter, payload, or request URL never grants authority by itself.
2. Every Mission Action side effect requires the same server-side, just-in-time (JIT) decision and a durable claim before the external effect can begin.
3. Missing, expired, revoked, stale, mismatched, over-budget, unapproved, or unregistered authority fails closed.
4. The general web runtime has no direct Mission Action provider credentials and no direct network path to provider endpoints.
5. The executor has no unrestricted internet egress. It can reach the approved control-plane interfaces and a fixed-destination egress gateway only.
6. A timed-out, cancelled, or otherwise ambiguous send becomes `UNKNOWN`. No blind retry follows an unknown outcome.
7. A successful-looking response is not trusted until the receipt is validated and bound to the exact execution and request.
8. All claims about safety must cite evidence from the exact source/test SHA and from the relevant runtime boundary.

## 2. Proposed trust boundaries

| Component | Trust level and responsibility | Must not be allowed to do |
|---|---|---|
| Client / planner | Untrusted intent and proposed plan | Grant authority, choose provider destination, hold provider credentials, commit outcomes |
| Web control plane | Authenticate user, check workspace, record intent, request a decision | Perform Mission Action provider I/O directly |
| Authoritative execution ledger | Source of the current mission/action/authority, lease, claim, idempotency, budget and result state | Accept a client/adapter assertion as proof of authority or provider outcome |
| Isolated executor | Validate the narrow execution envelope; acquire JIT claim; coordinate dispatch and reconciliation | Reach providers directly, select request-supplied destinations, retry UNKNOWN |
| Egress gateway | Enforce fixed destination and provider/account scope; perform outbound transport; record dispatch/receipt evidence | Accept arbitrary URLs, transports, credential selectors, or caller-provided adapter code |
| Provider | External side-effect system | Be treated as authoritative unless its documented contract supports the claim being made |
| Evidence/audit path | Correlate decisions, claims, sends, receipts and reconciliations | Store secrets, bearer tokens, or unnecessary raw sensitive payloads |

This architecture is provider- and platform-neutral. The final hosting primitive, workload identity, network policy mechanism, signature format, and gateway implementation are open decisions and require a separate review; they must not be inferred from the disposable Docker prototype.

## 3. Required execution sequence

1. **Intent:** The authenticated web control plane records the user's goal and proposed action. The proposal is not authorization.
2. **Decision:** The authoritative decision interface checks identity/workspace binding, action scope, destination/audience, approval, authority revision, expiry, and remaining budget.
3. **Narrow execution envelope:** The control plane passes immutable identifiers plus the approved audience, authority revision, stable idempotency key, expiry, canonical request digest, and a strong execution identity/signature. Provider destination and credentials are excluded from caller control.
4. **JIT claim:** The isolated executor authenticates the envelope and atomically claims the current lease/authority from the authoritative ledger. A stale or already-used claim is denied before outbound traffic.
5. **Durable pre-send evidence:** Record the claim and dispatch-start evidence before any gateway request that could create an external effect.
6. **Fixed gateway:** The executor sends only the approved envelope to a fixed gateway API. The gateway selects destination and credentials from reviewed server-side configuration, not request fields.
7. **Receipt validation:** Bind the receipt to provider identity and account/context, execution ID, audience, idempotency key, canonical request digest, and any provider-specific receipt fields. Uncorrelatable or malformed receipts are not success.
8. **Reconciliation:** On timeout, lost response, cancellation after send, malformed receipt, or other ambiguity, transition to `UNKNOWN` and call a separate fixed-destination lookup path. A fake or real `NOT_FOUND` response alone is not proof of `NOT_SENT`.
9. **Outcome commit:** Only verified, correlated evidence may commit a terminal outcome. Unknown remains unresolved until authoritative evidence exists.

## 4. Network and credential policy

- **Web runtime:** no provider secrets for Mission Actions and no direct route to the relevant provider APIs. Any remaining general app egress must have an explicit effect classification and separate rationale.
- **Executor runtime:** default-deny egress at the OS/container/orchestrator/network layer; permit only explicitly allowlisted ledger/control-plane endpoints and the fixed gateway. Application-level monkey-patching is defense-in-depth, not the enforcement boundary.
- **Gateway runtime:** narrow inbound identity; fixed provider destination/account allowlist; provider credentials scoped only here where possible; request-size limits; strict schemas; rate and budget controls; secret-safe telemetry. It may not honor request-supplied URLs or redirect to unapproved destinations.
- **Identity:** the fresh 256-bit bearer token in the disposable test is test-fixture authentication only. Production must use a reviewed workload identity / strong authenticated envelope and an auditable rotation/revocation story. Do not promote the test token design to production.
- **Process coverage:** network policy must cover the parent process, worker threads, child processes, native libraries, dynamically loaded and transitive dependencies, and every supported runtime. Node API tests cannot substitute for the OS/network policy.

## 5. Failure-state policy

| Condition | Required disposition | Automatic dispatch retry |
|---|---|---|
| Missing/stale/revoked authority or lease | Deny; no provider call | No |
| Budget or approval scope mismatch | Deny; no provider call | No |
| Adapter/audience not registered | Fail closed before privileged client/provider call | No |
| Gateway rejects destination or envelope | Deny and record safe reason | No |
| Provider timeout after possible send | `UNKNOWN`; reconcile on separate lookup path | No |
| Missing/malformed/mismatched receipt | Do not commit success; reconcile | No |
| Reconciliation says `FOUND` with valid binding | Record verified result | Not needed |
| Reconciliation says `NOT_FOUND` without provider-specific authoritative no-send semantics | Keep `UNKNOWN` | No |
| Provider 429/5xx or caller cancellation | Treat according to reviewed provider contract; if send status is ambiguous, `UNKNOWN` | No blind retry |

## 6. Audit and observability

Capture stable correlation IDs for intent, decision, claim, dispatch, receipt, and reconciliation. Record authority/revision and digest references, timestamps, safe outcome codes, gateway policy decision, and provider response classification. Redact credentials, bearer tokens, session cookies, and unnecessary personal data. A log line or HTTP response alone must not be considered the authoritative execution ledger.

## 7. Required proof gates

| Gate | Evidence required | Current disposition |
|---|---|---|
| A — Entrypoint/effect inventory | Enumerate every API route, Server Action, middleware, scheduled task, worker, SDK/native entrypoint and direct transport; classify and test every exception | Partial; inventory guards are regression detectors |
| B — Isolated executor/gateway | Deployed-equivalent default-deny network policy; direct TCP/UDP/HTTP/2/TLS/DNS and child/worker/native/transitive probes denied; fixed path works; cleanup verified | Disposable Docker prototype passes selected probes; production boundary not established |
| C — Provider contract | Vendor/account-specific idempotency, stable request identity, authentic receipt, authoritative reconciliation and evidence for `NOT_SENT`; uncertainty and cancellation race tests | Fake provider only; real-provider contract not verified |
| D — Ledger and recovery | Durable pre-send evidence; atomic JIT claim; concurrent claim/budget/idempotency tests; no blind retry; receipt-bound outcome commit | Local disposable PostgreSQL/W21 passes; hosted schema parity and deployed enforcement not established |
| E — Release | Exact-SHA Web Unit, Web CI, Flutter CI and W21; artifact links; independent security review; rollback, redaction and recovery review | CI/W21 passed on `5dc99d6dfb3ba37ced235482fa7e6a461489b0ae`; production gates still open |

## 8. Safe implementation order

1. Finish the source inventory and define testable exceptions. Do not claim that static analysis proves universal mediation.
2. Keep expanding only reproducible local tests for remaining DNS/socket/process/runtime paths. Retain exact provider counters and cleanup verification.
3. Review the execution-envelope and ledger contracts against actual source and existing migration history before proposing any schema/RPC work. Do not invent or apply migrations during this phase.
4. Specify a deployable executor/gateway and network-policy design with no credentials first. Validate it in a disposable environment that models the intended deployment.
5. Review provider-specific guarantees using public documentation and a separately authorized sandbox plan. Keep the provider registry empty until security review and approval.
6. Only after all gates pass, propose a separate staging plan. Deployment, hosted Supabase changes, real credentials, billing, DNS, and provider registration remain out of scope for this design artifact.

## 9. Current decision and evidence boundary

The latest local gate at the time of this document passed on source/test SHA `5dc99d6dfb3ba37ced235482fa7e6a461489b0ae`:
- [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706603498)
- [Web CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706603331)
- [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597163)
- [Full W21 Local Launch Gate](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203)
- [W21 evidence artifact](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203/artifacts/11958244046)
- [Browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203/artifacts/11958393754)

These results prove the tested disposable scenarios only. They do not prove universal production egress enforcement, production credential separation, real-provider idempotency/receipt authenticity/reconciliation, or hosted Development schema parity.

**Disposition: NO-GO.** Keep `TRUSTED_DISPATCH_ADAPTERS` empty/fail-closed, leave PR #39 Draft/open/unmerged and Issue #23 open. Do not change hosted Supabase, production, deployment settings, secrets, credentials, billing, or DNS.

# ZAVQERA Universal Egress Boundary — Implementation Plan (2026-10-15)

**Status:** Design/acceptance plan only. This document does not claim universal egress mediation is implemented or proven.
**Candidate:** PR #39, Draft / unmerged.
**Non-negotiable:** Keep the provider adapter registry empty until the runtime boundary and provider contract pass review. No live credentials, hosted Supabase changes, production deployment, or PR merge are part of this work.

## 1. Current evidence and its limit

The current candidate has source-graph tests for Mission Action API routes, a deny-by-default trusted adapter registry, an authenticated internal worker route, a request-body ceiling, and an actual-route integration test under Docker `--network none`. Commit `843855a75e7a1e5b1a06456b7e42347357969020` adds an adversarial egress integration test, also run inside the same `--network none` container, probing direct `fetch`, Node HTTP/HTTPS, TCP/TLS sockets, DNS resolution, and a child-process socket attempt. Web Unit, Web CI, and Flutter CI all passed on this exact commit (runs 38688489190, 38688489262, and 38688489297 respectively). The current branch also inventories other network-capable app routes and identity/session entrypoints separately.

These controls are useful defense-in-depth, but they do **not** establish a universal runtime egress boundary:
- Static source analysis cannot prove the absence of every dynamically loaded, native, transitive dependency, or future runtime path.
- A test container with networking disabled proves only that tested route's behavior in that test environment.
- The Next.js/Netlify application runtime can still make ordinary outbound requests for separately authorized workflows (for example, AI planning/research, password-range lookup, identity/session operations, and invitation email). These are distinct effects and must not be misrepresented as Mission Action dispatch.
- The real provider registry is intentionally empty. No real provider receipt or reconciliation behavior has been tested.

## 2. Required target architecture

Mission Action side effects must run in a **separate executor runtime** whose network policy is controlled independently of the web application. The web app must not possess direct provider credentials or a direct route to provider APIs for Mission Action execution.

Target flow:

1. Authenticated web request records an intent; it cannot perform the external effect.
2. A trusted executor receives a narrow, signed/strongly authenticated execution envelope containing immutable execution ID, mission/action IDs, audience, authority revision, idempotency key, expiry, and payload digest.
3. The executor verifies the envelope and atomically claims the JIT authorization/lease from the authoritative ledger before any provider operation.
4. The executor can reach provider APIs only through an explicitly controlled egress gateway or equivalent network policy. Direct internet egress from the executor is denied by default.
5. Provider requests carry stable provider idempotency identifiers where supported. The executor persists dispatch-start evidence before sending and stores provider receipt evidence after a response.
6. A timeout or lost response becomes `UNKNOWN`, never an automatic retry. Reconciliation must query authoritative provider state or prove `NOT_SENT` before retry authority can be released.
7. The result is accepted only when the receipt is bound to the same execution, audience, request digest, and provider account/context. Untrusted adapter output cannot authorize itself.
8. All egress decisions and execution transitions are auditable. No request-supplied URL, adapter code, transport, or provider configuration can select a destination or bypass the gateway.

## 3. Acceptance gates

### Gate A — source inventory (partial evidence exists)
- Enumerate every production entrypoint: API routes, server actions, middleware, scheduled jobs, worker handlers, and any native/CLI runtime entrypoints.
- Trace static local imports and flag outbound-capable transports, dynamic loaders, child processes, native loading, provider SDKs, and unknown third-party packages.
- Every exception must have an explicit effect classification, rationale, owner, and test.
- This gate is a regression detector, not a substitute for runtime network enforcement.

### Gate B — isolated executor runtime (not implemented/proven)
- Create a separate executor service/runtime; do not add it as a privileged capability to the public web process.
- Default-deny outbound networking. Permit only the egress gateway and the minimum ledger/control-plane endpoints needed to claim and record results.
- Keep provider credentials only in the executor/gateway secret scope, never in browser bundles or general web runtime.
- Prove from inside the deployed-equivalent executor that direct provider DNS/HTTPS/socket attempts fail and the approved gateway path succeeds.
- Verify the same denial from every supported process, child process, native module, and worker context.

### Gate C — provider contract (not tested against a real provider)
- Fake-provider contract tests must cover duplicate requests, replay, timeouts before/after send, malformed/missing receipts, receipt-binding mismatch, provider 429/5xx, cancellation races, and reconciliation after `UNKNOWN`.
- Require provider-specific evidence for idempotency and authoritative lookup. If the provider cannot establish whether an effect happened, the action remains `UNKNOWN` and cannot be retried automatically.
- A real adapter can be proposed only after Gates A–C pass; registration remains disabled until a separate security review approves the provider and account scope.

### Gate D — release evidence (not complete)
- Re-run Web Unit, Web CI, Flutter CI, and W21 on one exact code SHA; keep artifact links and SHA together.
- Validate hosted Development schema parity using read-only inspection or a separately approved safe procedure; do not change hosted Development or Production as part of this plan.
- Verify deployed executor egress policy, secret separation, logging/redaction, rollback, and recovery behavior.
- Keep launch **NO-GO** until every required gate has evidence and review.

## 4. Current disposition

| Control | Current status |
|---|---|
| Authenticated internal worker HTTP gate | Implemented for the candidate route; tests exist |
| Static Mission Action source-graph guard | Regression coverage exists; not universal runtime proof |
| Adapter registry | Empty / fail-closed |
| Real-provider idempotency and receipt contract | Not verified |
| Separate network-restricted executor and enforced egress gateway | Not implemented/proven |
| W21 on current branch head | Not yet confirmed for `843855a75e7a1e5b1a06456b7e42347357969020`; prior verified pass is on ancestor `43edddf6050ac56ad9d1d8f4120f9d389a333c8a` |
| Hosted Development parity | Not established |
| Launch | **NO-GO** |

## 5. Next concrete work order

1. Preserve the empty registry and keep PR #39 Draft.
2. Design and implement the executor/gateway in an isolated local test environment first; no hosted secrets or deployments.
3. Extend adversarial testing to dynamic loaders and transitive/native dependency paths; current tests cover selected Node network APIs and one child process only.
4. Add provider-contract tests using only a fake provider and a deterministic fake ledger for replay, timeout boundaries, malformed receipts, receipt-binding mismatch, 429/5xx, cancellation races, and reconciliation after `UNKNOWN`.
5. Confirm W21 on one exact SHA and update this document with evidence links, not assumptions.

# ZAVQERA Universal Egress Boundary — Implementation Plan (2026-10-15)

**Status:** Design/acceptance plan only. This document does not claim universal egress mediation is implemented or proven.
**Candidate:** PR #39, Draft / unmerged.
**Non-negotiable:** Keep the provider adapter registry empty until the runtime boundary and provider contract pass review. No live credentials, hosted Supabase changes, production deployment, or PR merge are part of this work.

## 1. Current evidence and its limit

The current candidate has source-graph tests for Mission Action API routes, a deny-by-default trusted adapter registry, an authenticated internal worker route, a request-body ceiling, and an actual-route integration test under Docker `--network none`. Commit `843855a75e7a1e5b1a06456b7e42347357969020` added adversarial egress probes under `--network none` for direct `fetch`, Node HTTP/HTTPS, TCP/TLS sockets, DNS resolution, and a child-process socket attempt; Web Unit, Web CI, Flutter CI and W21 passed on that source/test checkpoint (runs 38688489190, 38688489262, 38688489297, and 38688482588). The newer test-only topology prototype under `tool/mission-executor/` runs an executor only on an internal Docker network, a fake provider on a separate egress network, and a fixed-destination fake gateway on both. The new topology step passed in W21 run 38689614876; full W21 is still running on `d97d2e97ca1f4f1d6e7a92ef788766ccb97a0562`. Web Unit and Web CI passed on `d97d2e9`; Flutter CI was still running at this note. The current branch also inventories other network-capable app routes and identity/session entrypoints separately.

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
| Separate network-restricted executor and enforced egress gateway | Production runtime not implemented/proven; disposable Docker topology prototype exists and its isolated-network step passed, with full W21 still running |
| W21 on current branch head | Not yet confirmed for `843855a75e7a1e5b1a06456b7e42347357969020`; prior verified pass is on ancestor `43edddf6050ac56ad9d1d8f4120f9d389a333c8a` |
| Hosted Development parity | Not established |
| Launch | **NO-GO** |

## 5. Next concrete work order

1. Preserve the empty registry and keep PR #39 Draft.
2. Complete W21 on the current exact source/test SHA and retain the full evidence/cleanup artifact.
3. Extend the local topology prototype to cover dynamic loaders and transitive/native dependency paths; current probes cover selected Node network APIs and one child process only.
4. Expand fake-provider contract tests for timeout boundaries, malformed receipts, receipt-binding mismatch, provider 429/5xx, cancellation races, and reconciliation after `UNKNOWN`.
5. Only then design the production executor/control-plane integration; keep it separate from the public web process and do not deploy or register a real provider.

## Exact source/test checkpoint — 2026-10-15 — `f146b11914b81f68ed025ac96d99befb0c2c8362`

This checkpoint supersedes the older running-status statements above.

### Exact-head CI

All three workflows passed on code/test SHA `f146b11914b81f68ed025ac96d99befb0c2c8362`:
- Web Unit: [run 38697461636](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697461636) — SUCCESS.
- Web CI: [run 38697461610](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697461610) — SUCCESS.
- Flutter CI: [run 38697461393](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697461393) — SUCCESS.

### New disposable executor/gateway contract probes

The topology under `tool/mission-executor/` remains test-only; no production runtime or deployment configuration was changed. The isolated-network step in [W21 run 38697454403](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697454403) passed on this exact SHA, with these cases:
- Direct egress denial using static Node networking APIs, ESM dynamic imports, CommonJS `createRequire`, HTTP/HTTPS/TLS, and a fresh child process.
- Fixed-destination gateway dispatch to the fake provider with request-supplied destinations rejected.
- Stable replay/idempotency binding and exact provider request counters to detect hidden retries.
- Simulated accepted-then-lost response, missing/malformed/mismatched receipts, 429/500 responses, client cancellation, and reconciliation through a separate fixed-destination lookup endpoint.
- Reconciliation receipt-binding mismatch rejection, exact expected dispatch/reconciliation counts, and cleanup verification in the smoke-script trap.

The full W21 run on `f146b11914b81f68ed025ac96d99befb0c2c8362` had also passed the disposable PostgreSQL 17/pgTAP gate, Mission Authority execution security regressions, AI quota/plan/workspace security, actual-ledger concurrent idempotency, atomic budget, dispatch-claim and reconciliation-claim races, and W72 persistent fake-provider gateway integration. At the time this checkpoint was written, the browser E2E step was still running; cleanup verification and evidence upload were not yet confirmed. Do not mark the full W21 gate successful until the run concludes successfully.

The reconciliation endpoint is a fake-provider contract test, not a production service. Its `NOT_FOUND` response is not treated as proof that an external effect was never sent. The executor smoke test does not automatically retry dispatch after an unknown result. The test harness's fake provider stores receipts in process memory; this proves only the explicit test scenario, not provider-side durability or real provider semantics.

### Current release disposition

- `TRUSTED_DISPATCH_ADAPTERS` remains empty; no real provider is registered or enabled.
- Hosted Supabase Development schema parity remains unverified, and no hosted project was modified.
- Production-deployed network policy, provider credential separation, real-provider idempotency, receipt authenticity, authoritative reconciliation and proven `NOT_SENT` semantics remain unverified.
- Universal outbound-effect mediation across every production entrypoint remains **NOT ESTABLISHED**.
- PR #39 remains Draft/open/unmerged; Issue #23 remains OPEN.
- Launch remains **NO-GO**.

## W21 exact-source/test result — completed 2026-10-15

Full W21 Local Launch Gate **PASSED** on the exact code/test SHA `f146b11914b81f68ed025ac96d99befb0c2c8362`: [run 38697454403](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697454403).

Completed steps on that SHA include the isolated executor/network topology; disposable PostgreSQL 17 migration replay and pgTAP; Mission Authority execution security regressions; AI quota/plan/workspace security; actual-ledger concurrent idempotency, authority-budget, one-time dispatch-claim and one-time reconciliation-claim races; W72 persistent gateway integration with fake providers; full launch-gate browser E2E; disposable stack cleanup and cleanup verification; and evidence + browser-diagnostics uploads.

Artifacts:
- [W21 evidence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697454403/artifacts/11955043175)
- [Browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697454403/artifacts/11954987983)

The three exact-head CI workflows also passed on `f146b11914b81f68ed025ac96d99befb0c2c8362` (Web Unit run 38697461636; Web CI run 38697461610; Flutter CI run 38697461393). A documentation-only commit was subsequently added to record this result; the full W21 result applies to the exact source/test SHA above, not to a newly tested production deployment.

This is a local/disposable evidence pass, **not** production certification. No hosted Supabase schema parity, deployed network policy, real provider idempotency, real receipt authenticity or authoritative real-provider reconciliation was tested. `NOT_FOUND` is not equivalent to `NOT_SENT`; no automatic retry is permitted after an unknown outcome without stronger provider-specific evidence. The trusted provider registry remains empty and launch remains **NO-GO**.

## Test-only gateway authentication follow-up — 2026-10-15

**Source/test SHA:** `3527f31f795bfb2321627343f8f6fb25cbccc4bf`.

The disposable Docker smoke harness now generates a fresh 256-bit random token for every run and passes it only to the isolated executor and the fake gateway. The fake gateway rejects `POST /v1/execute` and `POST /v1/reconcile` with HTTP 401 when the authorization header is absent or the token is invalid, before reading the request body or forwarding to the fake provider. The smoke test asserts all four denial cases. The provider's exact dispatch/reconciliation counters fail if those denied requests are forwarded.

This is test-fixture authentication only. It is not the production identity/signature protocol, does not prove a caller's ledger authority, and is not evidence of production credential isolation. The token is per-run and is not forwarded to the fake provider.

### CI on the authentication follow-up SHA

All three GitHub Actions workflows passed on `3527f31f795bfb2321627343f8f6fb25cbccc4bf`:

- Web Unit: [run 38700344037](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38700344037) — SUCCESS.
- Web CI: [run 38700344198](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38700344198) — SUCCESS.
- Flutter CI: [run 38700343936](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38700343936) — SUCCESS.

The latest **confirmed full W21 pass remains** run 38697454403 on source/test SHA `f146b11914b81f68ed025ac96d99befb0c2c8362`. A full W21 result for the new authentication follow-up SHA is not confirmed in this checkpoint and must not be inferred from the three workflows above.

### Updated disposition

- Test-only gateway authentication: implemented in the disposable smoke harness and covered by Web Unit/Web CI/Flutter CI on SHA `3527f31`; full W21 on this exact SHA remains unconfirmed.
- Production executor, production gateway identity, production network policy, live-provider behavior, and hosted schema parity: not established.
- Provider registry: empty / fail-closed.
- Issue #23: remains OPEN. PR #39: remains Draft/open/unmerged.
- Launch: **NO-GO**.

## Direct fake-provider IP isolation follow-up — 2026-10-15

**Exact code/test SHA:** `b184b91540c80be8a07b455bddaeca9080fad4f0`.

The disposable topology now discovers the running fake provider's actual IPv4 address and passes that address to the isolated executor test. Before testing normal gateway dispatch, the executor attempts a direct TCP connection to the discovered provider IP on port 9090; the test fails if the connection succeeds and passes only for a recognized network-denial error. The existing approved gateway path must still succeed afterward. This closes the weakness where a negative probe to a reserved TEST-NET address could fail even if the test did not prove isolation from the actual fake provider container.

### Exact-SHA CI

All three workflows passed on `b184b91540c80be8a07b455bddaeca9080fad4f0`:

- Web Unit — PASS: [run 38701026107](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701026107). The run includes the Docker `--network none` worker-route/adversarial-egress test step.
- Web CI — PASS: [run 38701026169](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701026169).
- Flutter CI — PASS: [run 38701026080](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701026080).

The confirmed full W21 pass remains [run 38697454403](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697454403) on earlier code/test SHA `f146b11914b81f68ed025ac96d99befb0c2c8362`. A full W21 result for `b184b91540c80be8a07b455bddaeca9080fad4f0` is not confirmed in this record and must not be inferred from the three workflows above.

### Updated disposition

- Test-only fake gateway authentication and direct-IP isolation probes: implemented and covered by exact-SHA CI above.
- Production executor/gateway identity, deployed network policy, real-provider contract, provider credential separation, authoritative real-provider reconciliation, and hosted Development schema parity: not established.
- Universal production egress mediation: **NOT ESTABLISHED**.
- Provider registry: empty / fail-closed.
- PR #39: Draft/open/unmerged. Issue #23: OPEN.
- Launch: **NO-GO**.



## Exact-source/test checkpoint — UDP and HTTP/2 — 2026-10-15

**Code/test SHA:** `5dc99d6dfb3ba37ced235482fa7e6a461489b0ae`.

The disposable topology now verifies a direct HTTP/2 connection attempt to the actual fake-provider IPv4 address is denied and that a UDP datagram submitted by the isolated executor is not received by a bound fake-provider UDP canary (`udpProbeCount === 0`). The provider's UDP endpoint is bound before HTTP readiness is exposed, avoiding a false pass from probing an unbound destination.

Exact-SHA results:
- Web Unit — [38706603498](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706603498) — SUCCESS.
- Web CI — [38706603331](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706603331) — SUCCESS.
- Flutter CI — [38706597163](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597163) — SUCCESS.
- Full W21 — [38706597203](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203) — SUCCESS.

Artifacts: [W21 evidence 11958244046](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203/artifacts/11958244046), [browser diagnostics 11958393754](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203/artifacts/11958393754).

This closes only the new test-fixture coverage gap. Universal production egress mediation, the production executor/gateway and network policy, production credential separation, real-provider idempotency and authoritative reconciliation, and hosted Development schema parity remain unproven. Launch stays **NO-GO**.


## Production entrypoint graph guard — exact source/test SHA `c50b9db5610f483f63abdb1504465711c8e3b74e`

The local Mission Action dependency-graph test now treats App Router routes, root/nested page and layout/metadata handlers, middleware, instrumentation and every detected `"use server"` module as source roots. It additionally rejects new conventional background/worker/job/cron/scheduled/task/queue/platform-function paths until reviewed and inventoried. The regression explicitly asserts root `app/page.tsx` and `app/layout.tsx` are in the entrypoint set and that only the authenticated internal worker route can reach the persistent dispatch gateway/worker boundary/registry.

Exact-SHA CI passed:
- [Web Unit 38708716964](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716964)
- [Web CI 38708723357](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708723357)
- [Flutter CI 38708716868](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716868)

W21 [run 38708716869](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716869) was still running its browser E2E at the time of this update; no full-gate claim is made on `c50b9db` yet. The previous completed W21 pass on parent source/test SHA `3e4f6a573e3be3df86b7fa5d6035b2a7eb989e92` is [run 38707978336](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38707978336), with [evidence artifact 11959556889](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38707978336/artifacts/11959556889) and [browser diagnostics 11959343783](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38707978336/artifacts/11959343783).

Static source reachability remains a regression detector, not universal runtime egress proof. Production network enforcement, native/transitive runtime coverage, deployed credential separation, real-provider contract evidence, and hosted Development schema parity remain open. Release stays **NO-GO**.


## Completed W21 checkpoint — production-entrypoint graph guard — 2026-10-15

**Exact source/test SHA:** `c50b9db5610f483f63abdb1504465711c8e3b74e`.

All exact-SHA gates passed:
- Web Unit: [38708716964](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716964).
- Web CI: [38708723357](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708723357).
- Flutter CI: [38708716868](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716868).
- Full W21: [38708716869](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716869).

W21 successfully completed browser E2E, disposable PostgreSQL 17/pgTAP, execution/authority regressions, quota/workspace checks, ledger races, W72 fake-provider integration, container cleanup verification and evidence uploads:
- [Evidence artifact 11959867882](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716869/artifacts/11959867882)
- [Browser diagnostics 11959932304](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716869/artifacts/11959932304)

The expanded static entrypoint guard explicitly includes the root App Router page/layout. The guard is only source-reachability regression evidence; it does not establish universal runtime egress enforcement or production/provider certification. Production network policy, deployed credential separation, real-provider idempotency/receipt/reconciliation, and hosted Development parity remain unproven. Launch remains **NO-GO**.

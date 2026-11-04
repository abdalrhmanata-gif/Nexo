# ZAVQERA — Continuation Handoff (2026-10-15)

**Purpose:** Authoritative transfer note for the next ChatGPT conversation. Read this first, then verify live GitHub state before any action. This supplements the older `ci/CI_HANDOFF.md`; that file is not the complete/current Mission Authority checkpoint.

## 1. Working rules — non-negotiable

- Do not merge any PR automatically. Keep PR #39 Draft/open/unmerged.
- Keep GitHub Issue #23 **OPEN**.
- Do not modify hosted Supabase Development or Main/Production; no hosted migration, schema mutation, or write test.
- Do not deploy, change Netlify configuration, alter secrets, add credentials, register/enable real providers, or change billing/DNS.
- Keep `TRUSTED_DISPATCH_ADAPTERS` empty and fail-closed.
- Do not spend paid-service/API credits or introduce external paid services. Prefer repository + local/disposable tests.
- Be concise in Arabic and report concrete verified actions, not promises. Make no claims beyond exact SHA and evidence.
- Launch decision remains **NO-GO** until universal outbound/effect enforcement and provider-contract evidence are proven.

## 2. Product and architecture context

ZAVQERA (repository name still Nexo) is an AI Mission Planner / Delegation Layer for personal and business workspaces from day one. A Mission is the unit of work and carries goal, authority/allowed and prohibited actions, budget, expiry, and evidence/outcome. Conceptual flow: User Goal → Intent → Identity → Authority → Policy → Authorization → Plan → Action → Execution → Evidence → Verification → Outcome.

Core domain/application contracts must remain provider-, backend-, storage-, queue/worker-, UI-framework-, and vendor-neutral. Do not couple the core to Flutter, Supabase, PostgreSQL, OpenAI, or a specific external provider. Existing direction includes approval engine, workspace membership roles (Owner/Admin/Member/Viewer), Agent Registry, Mission Templates, and separate personal/business workspaces.

Repository: https://github.com/abdalrhmanata-gif/Nexo  
Current working deployment reported by user (Netlify): https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app/app  
Supabase Development was previously reported ACTIVE_HEALTHY (PostgreSQL 17, eu-west-1), but hosted Development schema parity with candidate migrations is **not verified**. Main/Production remains untouched.

## 3. Exact live checkpoint verified 2026-10-15

### PR #39 — current implementation/review focus

PR: https://github.com/abdalrhmanata-gif/Nexo/pull/39  
Title: `[Mission Authority] Compose worker/JIT boundary with fake transport`  
State: **OPEN, DRAFT, NOT MERGED**.  
Head branch: `codex/mission-action-runtime-seam-test-20261014`  
Base branch: `codex/w80-sql-review-base-20261014` at `5e2094fd27c7de60496729956af562651de93137`.

- Latest code/test checkpoint: `b184b91540c80be8a07b455bddaeca9080fad4f0`.
- Latest docs-only PR head: `7fc9f6a114fa4736d3fa1287707f16f6f6908873` (commit records direct fake-provider-IP isolation evidence and release boundary).
- Web Unit PASS on code/test SHA: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701026107
- Web CI PASS on code/test SHA: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701026169
- Flutter CI PASS on code/test SHA: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701026080
- Web Unit PASS on latest docs head: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701277323
- Web CI PASS on latest docs head: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701277242
- Flutter CI PASS on latest docs head: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38701277300
- Latest confirmed **full W21 Local Launch Gate PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697454403 — on older code/test SHA `f146b11914b81f68ed025ac96d99befb0c2c8362`. **W21 on `b184b91` is not confirmed.** Never treat Web Unit/Web CI/Flutter CI as a substitute for W21.

The PR description at its current head contains additional technical evidence and links. Read it before continuing.

### Other PRs — leave unchanged

- PR #29: https://github.com/abdalrhmanata-gif/Nexo/pull/29 — OPEN/DRAFT/UNMERGED, `zavqera/ai-planner-integration` at `5e2094fd27c7de60496729956af562651de93137`, base `zavqera/alternative-web-deployment` at `46dc6029f084fb000ba511478d6e8aec3eb532b3`. AI Mission Planner; 281 changed files in prior recorded snapshot. Do not alter.
- PR #36: https://github.com/abdalrhmanata-gif/Nexo/pull/36 — OPEN/DRAFT/UNMERGED; isolated W80 PostgreSQL 17 verification workflow, head `81ef820d160bfef04edbbab181fc562de203f7fa`, base `main` at `f64a87addb25a7455c6acde446b81bb3427d43cc`. Do not alter.
- PR #37: https://github.com/abdalrhmanata-gif/Nexo/pull/37 — OPEN/DRAFT/UNMERGED; W80 invitation RPC grants/lookup boundary, head `2e7dcccf9679ecc78f2b522064a4b121135645c4`, base review branch at `5e2094fd27c7de60496729956af562651de93137`. Do not alter.
- Issue #23: https://github.com/abdalrhmanata-gif/Nexo/issues/23 — “Implement and prove the Mission Authority JIT enforcement boundary”; verified OPEN. Keep open. A project-status comment was added earlier (comment ID `6185088230`).

Re-query all statuses and SHAs at the start of the next conversation because GitHub may have changed since this snapshot.

## 4. Candidate implementation evidence in PR #39

- Shared authenticated worker HTTP gate/handler: `apps/web/lib/mission-authority/trusted-worker-http.mjs`; trusted dependencies are supplied statically by trusted caller.
- Actual protected internal Next.js worker POST route tested. Cases include authorization; malformed/extra input; execution ID validation; unregistered audience rejected before privileged-client creation; oversized/chunked request bodies without `Content-Length`; Research preflight/claim/completion failing closed without trusted DB credentials.
- Streaming body parser caps request body at 160 KB and cancels when exceeded.
- Route test runs under Docker `--network none`; selected direct Node networking, HTTP(S)/TLS/socket, DNS and child-process egress probes are denied in that test environment.
- Recursive Server Action inventory currently identifies `apps/web/app/app/missions/new/page.tsx` as authenticated workspace mission creation; verifies cookie-bound session, workspace owner binding/atomic RPC and no import path to dispatcher/registry.
- Outbound-effect inventory separately classifies AI planning/research, password-range lookup, invitation email and identity/session routes; do **not** claim all of these are Mission Action dispatch or already universally mediated.
- Pure reason-code inventory covers 158 exact source entries → 75 canonical outputs. It is not a production response layer; unknown/raw inputs fail closed; `ALLOW` is a decision, not a reason, and ambiguous approval semantics remain unchanged.
- `apps/web/lib/mission-authority/provider-adapter-registry.mjs` keeps `TRUSTED_DISPATCH_ADAPTERS = Object.freeze({})`; no live provider is registered.

### Test-only executor/gateway topology

The disposable prototype under `tool/mission-executor/` places the executor on an internal Docker network, the fake provider on a separate egress network, and a fixed-destination fake gateway on both. This is local/fake-provider evidence only, not a production-deployed executor or proof of universal production egress enforcement.

Its PR description records tests for:
- direct egress denial via static Node networking, ESM dynamic import, CommonJS `createRequire`, HTTP/HTTPS/TLS, TCP socket and fresh child-process attempts; direct connection attempts to the actual fake-provider container IP fail;
- approved fixed-gateway path, rejection of caller-supplied destinations, replay/payload binding and exact provider request counters;
- 256-bit per-run fake bearer token for dispatch and reconciliation (wrong/missing token rejected before parsing/forwarding);
- accepted-then-lost response, missing/malformed/mismatched receipts, provider 429/500, timeout/cancellation and separate fixed-destination reconciliation endpoint;
- reconciliation receipt-binding mismatch and disposable container/network cleanup.

Do not extend the evidence beyond tested cases. Native modules, arbitrary transitive dependencies and every runtime/process context are not universally covered.

## 5. Important source-of-truth documents

Read from the current PR #39 branch/head and verify their current URLs/content:
- Universal egress plan: https://github.com/abdalrhmanata-gif/Nexo/blob/7fc9f6a114fa4736d3fa1287707f16f6f6908873/docs/ZAVQERA_UNIVERSAL_EGRESS_BOUNDARY_PLAN_2026-10-15.md
- Mission Authority implementation audit (older checkpoint; compare it against current PR body and current plan before relying on its SHA/status): https://github.com/abdalrhmanata-gif/Nexo/blob/d45fc33c5210d666a0fedaf5020c9b9fd90c9143/docs/ZAVQERA_MISSION_AUTHORITY_IMPLEMENTATION_AUDIT_2026-10-14.md
- Decision interface/reason-code proposal: https://github.com/abdalrhmanata-gif/Nexo/blob/43edddf6050ac56ad9d1d8f4120f9d389a333c8a/docs/ZAVQERA_MISSION_AUTHORITY_DECISION_INTERFACE_v0.1.md
- Current PR #39 description: https://github.com/abdalrhmanata-gif/Nexo/pull/39
- W21 full evidence and artifacts: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38697454403

## 6. What is still NOT established

- Universal production egress/effect mediation over all entrypoints, jobs, workers, SDK/native transports and runtime dependency paths.
- A production-isolated executor and enforced production egress gateway/network policy.
- Provider credential separation and secret scope in a deployed architecture.
- Real-provider idempotency guarantees, authentic receipt binding, authoritative reconciliation, and trustworthy proof of `NOT_SENT`.
- Full W21 passing on current code/test SHA `b184b91540c80be8a07b455bddaeca9080fad4f0`.
- Hosted Supabase Development schema parity with candidate migrations.

A fake reconciliation `NOT_FOUND` is not proof an external effect was never sent. An unknown external outcome remains `UNKNOWN`; do not auto-retry without provider-specific authoritative evidence.

## 7. Next work order for the next conversation

1. Read this file, fetch the current PR #39 body/head, Issue #23 state, branch heads and Actions runs. Do not assume this snapshot is still the live state.
2. Keep PR #39 Draft/open and keep the registry empty. Do not touch PR #29/#36/#37, hosted Supabase, Production, deployment, secrets or billing.
3. Try to obtain a full W21 result against the exact current code/test SHA (`b184b91540c80be8a07b455bddaeca9080fad4f0`) only if the workflow can be dispatched safely on the intended branch and permissions allow it. Do not make artificial code edits just to trigger a workflow. If W21 is not feasible, state the blocker rather than pretending it passed.
4. Inspect the existing `tool/mission-executor/` scripts and its newest W21 output; determine missing adversarial coverage (native/transitive loader/process contexts, DNS, socket variants) and expand only with reproducible disposable tests.
5. Expand fake-provider contract tests for all uncertain-send boundaries, cancellation races, duplicate/replay semantics and receipt binding. Preserve exact counters and cleanup guarantees.
6. Only after candidate tests are complete, plan—not deploy—the production executor/control-plane architecture, default-deny networking, fixed allowlisted gateway, narrow signed/strongly authenticated execution envelope, JIT claim, durable dispatch evidence, receipt validation and reconciliation.
7. Re-run Web Unit, Web CI, Flutter CI and W21 on one exact source/test SHA and link artifacts with that SHA. Validate hosted schema parity using read-only inspection or a separately approved safe procedure only; never mutate hosted projects.
8. Keep launch **NO-GO** until every required gate has evidence and review.

## 8. Paste this instruction into the next chat

“استأنف مشروع ZAVQERA من ملف الاستئناف هذا باعتباره نقطة البداية الحالية. تحقّق أولاً من الحالة الحية لـ PR #39 وIssue #23 ونتائج Actions على GitHub، ولا تعتمد على أرقام قديمة دون التحقق. تابع التنفيذ العملي بدقة وباختصار. ممنوع دمج أي PR أو تعديل Supabase Development/Main/Production أو النشر أو الأسرار أو إضافة مزود حقيقي. أبقِ سجل المزودات فارغاً وPR #39 Draft وIssue #23 مفتوحة. فرّق دائماً بين نجاح Web Unit/Web CI/Flutter CI وبين نجاح W21 الكامل؛ أحدث W21 مؤكد هنا على SHA أقدم من أحدث كود. أبقِ قرار الإطلاق NO-GO حتى إثبات حدود egress الشاملة وعقد المزود.” 


## 9. Verified continuation update — 2026-10-15

**Exact code/test SHA:** `1ff2eb66753575f6771c2acda9cfdfb6d9597c4b`.

### New adversarial coverage

Updated only `tool/mission-executor/isolated-executor-smoke.mjs` to add:
- a fresh ESM child process that attempts a TCP connection to the actual listening fake-provider IP on port 9090; the probe must fail with a recognized network-denial result;
- a Node `worker_threads` context making the same direct-provider-IP attempt; connection success, timeout without a classifiable denial, or unexpected exit fails the test.

The W21 isolated executor/fake-gateway step passed with both probes on this exact SHA. This is test-only Docker/fake-provider evidence; it is not proof of a deployed production egress boundary.

### Exact-SHA CI — PASS

- Web Unit: [run 38704593127](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38704593127) — SUCCESS.
- Web CI: [run 38704593180](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38704593180) — SUCCESS.
- Flutter CI: [run 38704593035](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38704593035) — SUCCESS.

### Full W21 — PASS on the same source/test SHA

[W21 Local Launch Gate run 38704584466](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38704584466) — SUCCESS on `1ff2eb66753575f6771c2acda9cfdfb6d9597c4b`.

Completed successfully: isolated executor/network topology including the ESM-child and worker-thread probes; disposable PostgreSQL 17/pgTAP; Mission Authority execution security; AI quota/workspace security; actual-ledger idempotency, budget, dispatch-claim and reconciliation-claim races; W72 persistent fake-provider integration; browser E2E; cleanup and cleanup verification; evidence uploads.

- W21 evidence: [artifact 11957672919](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38704584466/artifacts/11957672919).
- Browser diagnostics: [artifact 11957942588](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38704584466/artifacts/11957942588).

Two intermediate test-development commits failed W21 because of defects in the newly added probe (newline escaping and an unqualified `spawnSync` reference). Those defects were corrected; use only the final passing SHA and run above as evidence for this change.

### Disposition remains unchanged

- PR #39: OPEN / DRAFT / UNMERGED.
- Issue #23: OPEN.
- `TRUSTED_DISPATCH_ADAPTERS`: empty / fail-closed.
- No real provider or credential enabled; no hosted Supabase, Production, deployment, secrets, billing, or DNS changed.
- Universal production egress mediation, deployed executor/network policy, credential separation, real-provider idempotency/receipt authenticity/authoritative reconciliation, and hosted Development schema parity remain unproven.
- Launch remains **NO-GO**. A fake-provider `NOT_FOUND` is not proof of `NOT_SENT`; never automatically retry an unknown external outcome without authoritative provider-specific evidence.


## 10. Verified UDP and HTTP/2 egress coverage — 2026-10-15

**Exact code/test SHA:** `5dc99d6dfb3ba37ced235482fa7e6a461489b0ae`.

The disposable fake-provider topology now adds two distinct outbound-transport probes:
- **HTTP/2:** the executor attempts a direct HTTP/2 connection to the actual fake-provider container IPv4 address. Establishing the connection is a hard test failure; only a recognized network-denial outcome passes.
- **UDP:** the fake provider binds a UDP canary before its HTTP health endpoint becomes ready. The executor submits a datagram to the actual provider IP and the test orchestrator then reads the provider's private in-container metrics. The assertion requires `udpProbeCount === 0`; local `send()` callback success is not treated as proof of network delivery or denial.

Files changed for this checkpoint: `tool/mission-executor/fake-provider.mjs`, `tool/mission-executor/isolated-executor-smoke.mjs`, and `tool/mission-executor/egress-isolation-smoke.sh`.

### Exact-SHA validation — all PASS

- Web Unit: [run 38706603498](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706603498) — SUCCESS.
- Web CI: [run 38706603331](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706603331) — SUCCESS.
- Flutter CI: [run 38706597163](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597163) — SUCCESS.
- Full W21 Local Launch Gate: [run 38706597203](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203) — SUCCESS on the same SHA.

W21 completed the HTTP/2 and UDP isolation probes; disposable PostgreSQL 17/pgTAP; Mission Authority security regressions; quota/workspace security; actual-ledger idempotency, budget, dispatch-claim and reconciliation-claim races; W72 fake-provider integration; browser E2E; disposable stack cleanup and cleanup verification; and evidence uploads.

- W21 evidence: [artifact 11958244046](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203/artifacts/11958244046).
- Browser diagnostics: [artifact 11958393754](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38706597203/artifacts/11958393754).

These remain local/disposable fake-provider results. They do not establish production egress enforcement, native/transitive dependency behavior in every runtime, deployed credential separation, or any real-provider contract. The registry remains empty and launch remains **NO-GO**.


## 11. Full production-entrypoint graph guard — 2026-10-15

**Exact source/test SHA:** `c50b9db5610f483f63abdb1504465711c8e3b74e`.

Expanded `apps/web/test/mission-authority-worker-auth.test.mjs` so the Mission Action dispatch graph guard no longer treats API routes as its only roots. It now includes:
- all App Router `route.ts` handlers;
- nested and root App Router page/layout/template/default/loading/error/not-found/global-error and metadata entrypoints;
- middleware and instrumentation entrypoints;
- every module containing a Next.js `"use server"` directive;
- conventional background/worker/job/cron/scheduled/task/queue/platform-function locations, with a fail-closed assertion that any such new source location must be explicitly reviewed and inventoried.

The test asserts that root `app/page.tsx` and `app/layout.tsx` are actually included in the entrypoint set. For every discovered entrypoint it traverses statically declared local imports and permits reachability to the persistent Mission Action dispatch gateway / worker boundary / provider registry only from `app/api/internal/agent-executions/[executionId]/route.ts`.

This is an expanded static import-graph regression guard, not a full runtime trace or proof of all transitive package/native/runtime behavior.

### Exact-SHA CI — PASS

- Web Unit: [run 38708716964](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716964) — SUCCESS.
- Duplicate push Web Unit: [run 38708723370](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708723370) — SUCCESS.
- Web CI / typecheck / production build: [run 38708723357](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708723357) — SUCCESS.
- Flutter CI: [run 38708716868](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716868) — SUCCESS.
- Duplicate pull-request Flutter CI: [run 38708723245](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708723245) — SUCCESS.

### W21 on this source/test SHA — IN PROGRESS at documentation time

[W21 Local Launch Gate run 38708716869](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716869) is running on this exact SHA. Its executor/fake-gateway egress step, disposable PG17 preparation, and pgTAP plus Mission Authority/AI quota/ledger-race/fake-provider integration steps passed; browser E2E and subsequent disposable-stack cleanup/evidence steps have not yet been confirmed complete in this checkpoint. Do not infer a full W21 PASS until this run concludes.

Last completed full W21 PASS before this new root-entrypoint assertion was [run 38707978336](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38707978336) on source/test SHA `3e4f6a573e3be3df86b7fa5d6035b2a7eb989e92`, with evidence [artifact 11959556889](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38707978336/artifacts/11959556889) and browser diagnostics [artifact 11959343783](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38707978336/artifacts/11959343783).

Provider registry remains empty/fail-closed. PR #39 remains OPEN / DRAFT / UNMERGED; Issue #23 remains OPEN. No hosted Supabase, Production, deployment settings, secrets, billing, DNS, or real-provider credentials changed. Launch remains **NO-GO**.


## 12. W21 completion — production-entrypoint graph guard — 2026-10-15

**Exact code/test SHA:** `c50b9db5610f483f63abdb1504465711c8e3b74e`.

The root App Router addition was validated on this exact SHA:
- Web Unit: [run 38708716964](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716964) — SUCCESS.
- Web CI: [run 38708723357](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708723357) — SUCCESS.
- Flutter CI: [run 38708716868](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716868) — SUCCESS.
- Full W21 Local Launch Gate: [run 38708716869](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716869) — SUCCESS on the same SHA.

W21 completed the isolated egress topology; disposable PostgreSQL 17/pgTAP; Mission Authority security regressions; quota/workspace security; concurrent idempotency, atomic budget, dispatch-claim and reconciliation-claim races; W72 fake-provider PostgreSQL integration; browser E2E; disposable-stack cleanup and cleanup verification; and evidence uploads.

Artifacts:
- W21 evidence: [artifact 11959867882](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716869/artifacts/11959867882).
- Browser diagnostics: [artifact 11959932304](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38708716869/artifacts/11959932304).

Two intermediate commits in this entrypoint-graph workstream failed because of test-code regex/escaping defects; they were corrected before `c50b9db5610f483f63abdb1504465711c8e3b74e`. The PASS claims in this section apply only to `c50b9db5610f483f63abdb1504465711c8e3b74e`.

The new regression includes root `app/page.tsx` and `app/layout.tsx`, nested pages/layouts/metadata, route handlers, middleware, instrumentation and detected Server Actions, and fails if an unreviewed background/worker/job/cron/queue/function path appears. This remains static source-graph evidence, not an instrumented runtime trace.

**Disposition unchanged:** PR #39 OPEN / DRAFT / UNMERGED; Issue #23 OPEN; `TRUSTED_DISPATCH_ADAPTERS` empty/fail-closed; no real provider enabled; no hosted Supabase/Production/deployment/secrets changed; launch **NO-GO**.

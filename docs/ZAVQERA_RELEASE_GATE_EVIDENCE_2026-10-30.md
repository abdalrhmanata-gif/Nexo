# ZAVQERA release-gate evidence — 2026-10-30

**Decision: PUBLIC RELEASE NO-GO.** This report distinguishes verified disposable/CI evidence from hosted, live-provider, payment, and human-review evidence. It does not authorize a merge, migration, deployment, external action, charge, or production change.

## Candidate and evidence identity

- Repository: `abdalrhmanata-gif/Nexo`
- Mission Planner PR #29: OPEN / Draft / UNMERGED.
- PR head: `ccd20233c887a9f734b0e38fb32859dbb4805f78`.
- PR base: `fe7adba5cc036e807061061517b45a49effe8009`.
- W21 workflow: [40682745261](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745261), completed SUCCESS.
- W21 evidence artifact: [12813303558](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745261/artifacts/12813303558).
- W21 browser diagnostics: [12813497688](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745261/artifacts/12813497688).

**Important SHA clarification:** the W21 evidence artifact records tested SHA `5137bf2e3f8549823d3fbb29bd41c5b66fa983b5`. GitHub identifies it as the PR merge-ref commit `Merge ccd20233c887a9f734b0e38fb32859dbb4805f78 into fe7adba5cc036e807061061517b45a49effe8009`. Its parents are exactly the recorded PR head and base above. Thus W21 exercised the combined PR+base tree, not the PR head SHA in isolation. Do not label the artifact as a standalone push test on `ccd2023...`.

## What is proven in isolated CI

### Mission Authority and fail-closed behavior

- The mission-action adapter registry is intentionally empty: `apps/web/lib/mission-authority/provider-adapter-registry.mjs`.
- The internal worker resolves the trusted adapter before constructing the privileged database client; with no registered adapter, it fails closed.
- W21 exercised the real loopback worker route and recorded: `httpStatus=503`, `outcome=unregistered_adapter_denied`, `providerCall=not_attempted`.
- Controlled-adapter and persistent-gateway suites cover exact authority/approval/action/input/destination binding, audience mismatch, stale/revoked/expired authority, malformed claim records, budget exhaustion, receipt validation, and fail-closed outcomes.
- This proves the no-adapter deny path and the tested fake-adapter contract. It does **not** prove a real provider is registered, or that a real external Mission Action has been certified end-to-end.

### Independent concurrency and idempotency evidence

W21 ran against the disposable PostgreSQL 17 ledger and all four scripts completed successfully:

- W67 actual-ledger idempotency race: same-key concurrent start has one winner; replay and changed-request reuse are refused.
- W68 actual authority-budget race: one action budget has one winner; budget reservation is atomic with start and reserved spend is preserved.
- W69 actual dispatch-claim race: exactly one worker acquires the durable dispatch claim; the concurrent loser is rejected; claim hashes and one audit event persist.
- W70 actual reconciliation-claim race: exactly one worker acquires the reconciliation claim; the concurrent loser is rejected; lease and audit event persist.
- Separate W25 two-session PostgreSQL atomic-fence test passed: [run 40682745216](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745216), including budget concurrency, idempotency uniqueness/binding, unknown reconciliation, and revocation/lease binding.

### Recovery and outcome integrity

- The W21 PostgreSQL 17 migration replay and pgTAP launch gate passed, including W49 recovery, W50 expiry fence, W66–W70, W71 expired external-execution budget recovery, W73 trusted events, W75 correlatable provider receipt, W76 external-success insert guard, W77 payload bounds, W78 history/event binding, W79 trusted Research completion, W80 workspace role checks, W81 Research JIT claim, and W82 request-bound AI generation reservation identity.
- W70 durable UNKNOWN reconciliation tests passed.
- W72 persistent gateway PostgreSQL integration passed with a **fake local provider**: a success receipt settles the reservation; an uncertain outcome stays UNKNOWN until an authoritative no-send lookup; reconciliation does not redispatch; audit records persist.
- The full launch-gate browser suite passed 2/2, and disposable cleanup was verified: no remaining containers or volumes for `zavqera-e2e-local`.
- No real provider API was called. Fake-provider receipt and no-send lookup evidence is not certification of a live vendor's receipt semantics, lookup API, idempotency behavior, or settlement.

### Exact workflow outcomes

- W21 Local Launch Gate: [run 40682745261](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745261) — SUCCESS; disposable PostgreSQL 17 replay, pgTAP, Mission Authority regressions, four actual-ledger races, W72 fake-provider integration, browser E2E 2/2, cleanup and evidence upload.
- W25 isolated two-session atomic fence: [run 40682745216](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745216) — SUCCESS.
- Web Unit: [run 40682745226](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745226) — SUCCESS.
- Web CI / authorization boundary / TypeScript / production build: [run 40682745358](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745358) — SUCCESS.
- Flutter CI: [run 40682745383](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745383) — SUCCESS.
- Netlify workflow: [run 40682745474](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/40682745474) — preview route verification SUCCESS; deployment job SKIPPED. Root and sign-in returned HTTP 200; the anonymous `/app` request was followed through to the sign-in page (final HTTP 200). Live OpenAI planning and authenticated live Research steps were SKIPPED, not passed.

## Current hosted Development findings (read-only; no writes)

Project: **ZAVQERA Development** `mrwmmbytcymqgwvcoywd`, ACTIVE_HEALTHY, PostgreSQL 17.6.1, eu-west-1.

- The current Supabase migration-list tool returned 65 entries, ending at `20261011150000_w65_agent_execution_table_write_boundary`. Candidate W66–W82 are not in that returned list.
- A prior 2026-10-28 catalog audit recorded 74 rows ending at the same W65 migration. The difference in row counts (65 vs 74) is unresolved; the two inventory methods have not been reconciled. Do not infer migration parity from a shared latest version.
- Historical read-only catalog checks also found the hosted one-argument `reserve_ai_generation(text)`, while candidate W82 uses the three-argument request-bound contract. The deployed Development `ai-plan` function was observed as a fail-closed 503 stub. Hosted Research completion signatures/grants and migration provenance still require the approved secure catalog/Management API capture and independent review.
- Security Advisor currently reports `auth_leaked_password_protection` = WARN / disabled.
- Performance Advisor currently reports 15 `unused_index` INFO findings. These are not a reason to drop indexes blindly.
- **No hosted SQL, migration, RPC mutation, grant, Auth configuration, secret, or production setting was changed by this review.**

## Billing, quota and spend controls

- The web AI planner has server-side quota reservation/consume/release code and isolated tests. This is not payment-backed subscription billing.
- PR #42 is OPEN / Draft / documentation-only. It confirms that Free/Plus/Pro display pricing exists, but no payment SDK, checkout/webhook lifecycle, verified subscription-to-entitlement projection, refunds/disputes handling, or payment-backed plan changes are implemented.
- The Flutter direct `ai-plan` Edge Function path is intentionally fail-closed with `503 ai_quota_enforcement_not_configured`; do not remove that guard until Flutter and web use one tested authoritative reservation/settlement path.
- No payment provider or merchant account has been selected/configured. No payment, checkout, invoice, webhook, or charge was run. No real OpenAI call was made in the current W21/Netlify verification.
- Account-level hard spend limits and alert configuration have not been independently verified. Application-side estimates are not platform-level hard caps.

## Manual authenticated UI review

- Netlify automated route checks passed for the public landing and sign-in routes.
- The signed-in desktop/mobile review has **NOT BEEN PERFORMED**. The connected Browser service returned `Browser access requires the originating browser context`; no authenticated browser tab was available to inspect.
- Anonymous route checks and automated E2E are not substitutes for a human visual review of Business, Workspace, Missions, approvals, pricing, and navigation after a real sign-in. No credentials were requested or placed in logs.

## Remaining release gates — still open

1. Reconcile the 65-vs-74 hosted migration inventory discrepancy and complete the approved secure read-only Management API/catalog capture, SQL-byte provenance comparison, function-signature and effective-grant review. Have an independent database/security reviewer sign off.
2. Resolve hosted W66–W82 parity in a reviewed, ordered, explicitly authorized **Development-only** rollout. Verify the legacy Research completion RPC is no longer callable and the trusted W79/W81 path is active before enabling Research. Do not run an ad hoc GRANT/REVOKE or migration.
3. Keep the mission-action provider registry empty until a specific real provider adapter, destination allowlist, approval binding, vendor idempotency/receipt semantics, reconciliation lookup, and failure/settlement behavior pass independent review and controlled non-production tests.
4. Select a payment provider and obtain an owner-controlled merchant/test account. Implement and test signed webhook verification, idempotent event ingestion, subscription lifecycle, entitlement projection, failed payments, cancellation, refund/dispute, and quota alignment. Do not grant paid entitlements from a checkout redirect.
5. Run real non-production OpenAI and Research checks only after the Development schema/API contract matches, with explicit cost authorization and tested account-level limits. Current live checks were skipped.
6. Perform authenticated manual desktop/mobile product QA using an authorized browser session and record the checked account type, routes, viewport sizes, findings, and remediation.
7. Obtain independent human security review and explicit owner approval before merge or production release.

## Release posture and safety

**NO-GO for public/paid launch.** PR #29 remains OPEN / Draft / UNMERGED; Issue #23 (universal Mission Authority enforcement) and the hosted-parity/release issues remain open. Keep the trusted provider registry empty/fail-closed. Do not promote production, alter Supabase Main, write hosted Development, enable a provider, configure billing/merchant secrets, change DNS, or incur paid usage from this evidence report.

This report records verified evidence and unresolved gates; it is not an authorization to perform those actions.

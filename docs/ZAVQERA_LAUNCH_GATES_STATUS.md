# ZAVQERA launch gates — verified engineering status

Updated: 2026-10-12 10:16 UTC  
Branch: `zavqera/ai-planner-integration`  
PR: [#29](https://github.com/abdalrhmanata-gif/Nexo/pull/29) — **OPEN / Draft / Unmerged**  
Code HEAD fully verified before this documentation-only update: `f986e8ef1d3ce7b40845893e7b0ad3518897366a`

## Automated CI — PASS on the verified code HEAD

All six core automated gates completed successfully on `f986e8ef1d3ce7b40845893e7b0ad3518897366a`:

- [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586800) — **PASS, 308/308 tests**.
- [Web CI, authorization tests, TypeScript and production build](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586776) — **PASS**.
- [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586804) — **PASS**.
- [W25 isolated PostgreSQL atomic fence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586783) — **PASS**.
- [W21 Local Launch Gate](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586774) — **PASS**. Disposable PostgreSQL 17 migration replay and pgTAP passed; Mission Authority SQL regressions W63–W76 that are included by the launch workflow passed; independent-session W67/W68/W69/W70 race tests and W72 persistent-gateway integration with fake adapters passed; Chromium browser E2E passed **2/2**; disposable-stack cleanup verified.
- [Netlify Deploy Preview verification](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586785) — **PASS** for the preview verification workflow. This is not a production deployment or proof of a live provider integration.

W21 artifacts:
- [Evidence and cleanup proof](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586774/artifacts/11740407722)
- [Browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586774/artifacts/11740333105)

Automated browser E2E is not the same as manual visual review of the live UI on desktop and mobile. Manual visual QA remains **NOT VERIFIED** in this release pass. The opt-in live OpenAI planning/authenticated Research tests and real invitation delivery are also **NOT VERIFIED** unless separately run with their required non-production credentials.

## Supabase Development — verified, Development only

Project: `mrwmmbytcymqgwvcoywd`, region `eu-west-1`, PostgreSQL 17.

The hosted migration ledger was checked after applying W56. Latest applied repository migration is:
- `20261010125620_w56_agent_execution_duplicate_dispatch_guard`

W56 was applied to **ZAVQERA Development only**. Read-only verification confirmed the function `private.start_agent_execution(uuid,uuid,uuid,text,jsonb)` contains the duplicate-execution guard; `anon` cannot execute it and `authenticated` can. A previously existing idempotency key now raises `EXECUTION_ALREADY_EXISTS` rather than returning an execution record as permission to dispatch an external provider request again.

This closes the duplicate-dispatch guard migration in Development; it does **not** prove full cross-worker reconciliation for unknown external outcomes, nor does it replace the remaining Mission Authority acceptance matrix.

W52/W53/W54/W55 remain ledger-aligned in Development. W52's foreign-key indexes and W53's RLS initplan optimization were verified; W53 removed the corresponding `auth_rls_initplan` advisor findings. The latest known Performance Advisor result has 17 `unused_index` INFO findings. Do not drop these indexes blindly; measure representative workload first. The Security Advisor still reports `auth_leaked_password_protection` — **WARN / Disabled**.

## Live provider and email gates — not yet verified

### Authenticated live Mission Research
- **NOT VERIFIED / gated.** The current Netlify workflow passed the real OpenAI mission-planning smoke test, but the authenticated live research check was skipped.
- The workflow requires a dedicated, pre-provisioned, email-confirmed Development test account through GitHub Actions secrets `SUPABASE_DEV_TEST_EMAIL` and `SUPABASE_DEV_TEST_PASSWORD` (or its explicitly supported Development-only fallback).
- Only run the intentionally marked live-research test once the required credentials are privately configured and verified. It creates persistent Mission/research/audit records in Development. Never paste credentials into chat or PR comments; never use Production credentials.
- A successful planning smoke test does not prove research citations, persisted research history, or the authenticated hosted route.

### Workspace invitation email
- Invitation email code is implemented, but actual delivery is **NOT VERIFIED**.
- The endpoint requires `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Configure them in Netlify **Deploy Previews only**, with a verified sender domain, then send one invitation from an authenticated workspace owner/admin and inspect delivery/bounce status in Resend.
- Team-level environment-variable inspection did not show these keys. Site-specific settings were not verified through the available read tools; do not infer that site-level values are absent.
- Provider acceptance must not be represented as guaranteed inbox delivery.

### Password-reset email
- Hosted preview password-reset email/callback flow has not been verified end-to-end. Local E2E is not a substitute.

## Mission Authority — partial, not production-certified

Current automated checks cover authorization boundaries, approval gates, quota reservations, idempotency, lifecycle and isolated PostgreSQL/browser scenarios. Remaining blockers:
- A complete provider-neutral just-in-time authority decision immediately before every real external side effect.
- Durable attempt journal and reconciliation for UNKNOWN external outcomes across independent workers.
- The complete acceptance matrix in [Issue #23](https://github.com/abdalrhmanata-gif/Nexo/issues/23), [Issue #24](https://github.com/abdalrhmanata-gif/Nexo/issues/24), and [Issue #25](https://github.com/abdalrhmanata-gif/Nexo/issues/25).
- Do not treat isolated adapter tests or local browser E2E as proof of production external-action enforcement.

## Deferred security and visual checks

- `auth_leaked_password_protection`: WARN / Disabled. The owner has chosen to defer the Supabase Pro upgrade. No plan/billing change was made.
- Manual visual QA on current live Preview, including mobile widths: **NOT VERIFIED**.
- Dynamic backend-generated scope/event text may still fall back to English in some contexts; localization regression tests pass for the covered UI and API strings.

## Release decision and safety boundaries

**Automated gates are green; full launch is not approved.**

Do not merge PR #29, mark it Ready, or promote to Production until the remaining release gates are verified or explicitly accepted by the owner. PR #29 must remain **OPEN / Draft / Unmerged**.

Supabase Main/Production was not modified. No Production deployment, DNS change, billing change, or paid-plan upgrade was made. All W56 application and catalog verification described above was performed against ZAVQERA Development only.


---

## Superseding verification update — 2026-10-10 13:32 UTC

This section supersedes the older HEAD/run references above for the latest code-bearing state. The previous sections are retained as historical evidence.

- **Latest code-bearing HEAD:** `ccf2cea7c5ef3901908a798a99c4591b7ad6fd0a`.
- A subsequent documentation-only commit updated the web mutation/side-effect inventory; it did not change runtime code or database schema.
- PR #29 remains **OPEN / Draft / UNMERGED**.

### Latest CI evidence for code-bearing HEAD

- [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054622596) — **PASS**.
- [Web CI / TypeScript / production build](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054622593) — **PASS**.
- [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054622643) — **PASS**.
- [W25 isolated PostgreSQL atomic fence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054622654) — **PASS**.
- [W21 Local Launch Gate](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054622588) — **PASS**. This run includes the W56 runtime duplicate-key behavior test in the PostgreSQL 17 pgTAP suite, the quota/plan/workspace security tests, full Chromium E2E, disposable-stack cleanup and evidence uploads.
- [Netlify Deploy Preview](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054622624) — **PASS** for preview route checks and real OpenAI mission planning. Authenticated live Mission Research remains **SKIPPED**.

### Current scope correction

The feature branch contains one confirmed real external provider path: authenticated Mission Research calls OpenAI after quota reservation and the `start_agent_execution` gate. This is a **partial route-specific gate**, not a universal provider-neutral Mission Authority boundary. See the follow-up in [the web mutation and side-effect inventory](./ZAVQERA_WEB_MUTATION_AND_SIDE_EFFECT_INVENTORY_2026-10-01.md).

W56 is applied and catalog-verified in Development only, with migration version `20261010125620`. The runtime test confirms a duplicate idempotency key raises `EXECUTION_ALREADY_EXISTS` and does not create a second execution row. It does not certify cross-worker reconciliation for every external UNKNOWN outcome.

### Gates still open

- Authenticated hosted live Mission Research, citations and persisted history: **NOT VERIFIED**; requires the dedicated confirmed Development account and private GitHub Actions secrets, and writes persistent records.
- Real invitation email delivery through Resend: **NOT VERIFIED**; requires Netlify Deploy Preview configuration and one delivery/bounce-checked invitation.
- Password-reset email/callback end-to-end: **NOT VERIFIED**.
- Manual desktop/mobile visual QA: **NOT VERIFIED**.
- `auth_leaked_password_protection`: **WARN / Disabled**, intentionally deferred pending the owner's future plan decision.
- Universal JIT authority enforcement, complete attempt journaling and UNKNOWN reconciliation, and full Issues #23–#25 acceptance matrix: **NOT CERTIFIED**.

**Release decision unchanged:** no merge, no Ready conversion, no Production promotion, and no Supabase Main/Production changes.


## Side-effect inventory correction — 2026-10-10

The feature branch has multiple real outbound boundaries, not only the Mission Research path:

- Authenticated draft planning: `/api/ai/plan` → OpenAI Responses API, with user authentication and quota accounting, but no Mission Authority execution attempt. Output is draft-only.
- Anonymous draft planning: `/api/ai/plan/anonymous` → OpenAI Responses API, with visitor/IP-based quota controls and fail-closed unknown-outcome accounting, but no durable Mission Authority attempt journal. Output is draft-only.
- Authenticated Mission Research: `/api/missions/[id]/research` → OpenAI web search, with the route-specific `start_agent_execution` gate and W56 duplicate guard; this is partial enforcement, not a universal JIT gateway.
- Workspace invitation: `/api/business/invitations` → Resend email API, initiated by a workspace owner/admin. Code is present, but actual delivery remains **NOT VERIFIED**.

The updated [side-effect inventory](./ZAVQERA_WEB_MUTATION_AND_SIDE_EFFECT_INVENTORY_2026-10-01.md) distinguishes these boundaries and records their controls and limitations. This correction changes documentation only and does not alter the release decision.


---

## Superseding verification update — 2026-10-10 13:36 UTC

- **Verified PR head:** `8d357dba54199f9af70bad87d56ff46eddb3989b`.
- **PR #29:** OPEN / Draft / UNMERGED. No production promotion or Supabase Main change.

### Latest CI on this exact head
- [W21 Local Launch Gate](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38056171481) — **PASS**.
- [W25 Isolated PostgreSQL Atomic Fence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38056171490) — **PASS**.
- [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38056171524) — **PASS**.
- [Web CI / TypeScript / production build](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38056171495) — **PASS**.
- [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38056171504) — **PASS**.
- [Netlify Deploy Preview checks](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38056171528) — **PASS** for the workflow's preview checks; the production deploy job was skipped as expected for a PR validation workflow.

### Read-only hosted Development recheck
- Latest repository migration remains `20261010125620_w56_agent_execution_duplicate_dispatch_guard`; no migration was applied during this verification.
- Security Advisor still reports `auth_leaked_password_protection` **WARN / Disabled**. The owner has deferred the paid-plan change.
- Performance Advisor reports 17 `unused_index` INFO findings. No index was removed; measure representative workload before any removal.

### Gates still open (not inferred from CI)
- Authenticated hosted live Mission Research with real citations and persisted history: **NOT VERIFIED / skipped** because the gated Development test credentials are not confirmed.
- Actual Resend invitation delivery: **NOT VERIFIED**; preview-scoped configuration and a delivery/bounce-checked invitation are still required.
- Hosted password-reset email/callback: **NOT VERIFIED**.
- Manual desktop/mobile visual QA: **NOT VERIFIED**.
- Universal Mission Authority JIT enforcement, durable UNKNOWN reconciliation across independent workers, and complete Issues #23–#25 acceptance matrix: **NOT CERTIFIED**.

**Release decision:** all six automated PR gates pass on this head, but this is not full launch approval. Keep PR #29 OPEN / Draft / Unmerged. Do not modify Supabase Main/Production, change billing/DNS, or promote production without the remaining evidence and explicit release approval.


## Exact-head follow-up — 2026-10-11 — `e06198d6e1f987c41cc005fce29ef806a19f79fb`

The following six core gates were independently checked after completion, all on the exact same candidate commit:

- Web Unit — **PASS**, 270/270 tests: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38131070850
- Web CI / TypeScript / production build — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38131070829
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38131070824
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38131070847
- Netlify Deploy Preview verification — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38131070859
- W21 Local Launch Gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38131070887

W21 completed disposable PostgreSQL 17 migration replay, pgTAP, AI quota/plan/workspace security tests, full browser E2E, disposable-stack cleanup verification, and evidence/diagnostics uploads. Artifacts: [W21 evidence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38131070887/artifacts/11699162595) and [browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38131070887/artifacts/11698054415).

The live OpenAI planning and authenticated hosted Mission Research tests were **SKIPPED / NOT VERIFIED** because they require explicit opt-in and private Development-only credentials. W21 uses the mock AI provider and does not prove live-provider correctness. Automated browser E2E passed, but a separate human visual QA record is still missing.

### Remaining release acceptance items

1. Run the intentionally gated hosted Mission Research/citations/persisted-history test against the fixed Supabase Development project with a dedicated confirmed test account and privately configured GitHub Actions secrets. Never use Production credentials or paste secrets into chat/issues.
2. Verify real invitation email delivery in Netlify Deploy Previews only, using privately configured Resend credentials and a verified sender domain; confirm delivery/bounce state rather than treating provider acceptance as inbox delivery.
3. An authorized owner must decide whether to enable leaked-password protection in Supabase Development; it remains WARN / Disabled. No plan/billing change was made.
4. Record human visual QA on the current Netlify preview at desktop and mobile widths.
5. Complete provider-neutral just-in-time authority enforcement and durable UNKNOWN-outcome reconciliation before enabling real external side effects. Current in-memory adapter tests are not production persistence or external-provider certification.

PR #29 remains **OPEN / Draft / UNMERGED**. Supabase Main/Production, production deployment, DNS, billing, and real provider side effects remain untouched. Automated candidate gates are green; **full production launch is not approved**.


## Exact-head verification — W67 actual ledger concurrency

Verified candidate HEAD: `c1ce23840f442edcf7a84149f34e7b8b3ba460f4`.

All six automated gates passed on this exact HEAD:
- Web Unit: **PASS** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577742
- Web CI / typecheck / build: **PASS** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577804
- Flutter CI: **PASS** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577763
- W25 isolated PostgreSQL atomic-fence harness: **PASS** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577756
- Netlify Deploy Preview verification: **PASS** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577798
- W21 disposable local launch gate: **PASS** — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577786

W21 now runs the W66-specific pgTAP file and W67 actual-ledger race test. W67 opened two independent PostgreSQL sessions authenticated as the same disposable workspace owner and called the actual migration-replayed `public.start_agent_execution` RPC with the same mission, agent, request and idempotency key. Its recorded assertions were:
- `W67_ACTUAL_LEDGER_IDEMPOTENCY_RACE=PASS`
- `actual_start_same_key_concurrency=PASS`
- `actual_start_replay_refusal=PASS`
- `actual_start_changed_request_refusal=PASS`

The test verified one durable execution row and one `AGENT_EXECUTION_STARTED` event; the losing session got `EXECUTION_ALREADY_EXISTS`. Exact replay was rejected, and changed request content under the same key was rejected with `EXECUTION_IDEMPOTENCY_BINDING_MISMATCH`. The launch gate also completed browser E2E (2/2), disposable-stack cleanup verification, and artifact uploads:
- Evidence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577786/artifacts/11713543943
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38170577786/artifacts/11713514214

**Scope limit:** W67 proves concurrent same-key idempotency against the actual ledger and RPC; it does **not** prove atomic action/spend budget reservation. The script explicitly emits `W67_BUDGET_RESERVATION=NOT_TESTED`. Production JIT dispatch and real-provider UNKNOWN reconciliation remain unverified. PR #29 remains OPEN / Draft / UNMERGED; production, hosted Development, DNS and billing were untouched.


## Exact-head verification — W70 durable reconciliation — 2026-10-12

Verified candidate HEAD: `cb0d4fbffad55695d8b4f1b9282f4d19757e4112`. All six automated gates passed on this exact commit:

- Web Unit — **PASS, 294/294**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185205841
- Web CI / typecheck / production build — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185205821
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185205874
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185205882
- Netlify Deploy Preview verification — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185205818
- W21 Local Launch Gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185205827

W21 passed PostgreSQL 17 migration replay and pgTAP, AI quota/plan/workspace security tests, and all three actual-ledger races: W68 atomic authority-budget reservation, W69 one-time dispatch claim, and W70 one-time reconciliation claim. Browser E2E passed **2/2**. Cleanup was verified with `remaining_containers=none`, `remaining_volumes=none`, and `cleanup_verified=true`.

- W21 evidence: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185205827/artifacts/11718779733
- W21 browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185205827/artifacts/11719148549

**Release boundary:** the SQL reconciliation contract and provider-neutral gateway seam are now present, but no production server route is wired to a real provider adapter. Hosted Research/citations/history, real Resend inbox delivery, human visual QA, and Development leaked-password protection remain open. PR #29 is OPEN / Draft / UNMERGED; no production deployment, Supabase Main change, DNS/billing change, or real provider side effect was performed.


---

## Exact-head verification — current W70 candidate — 2026-10-12

Verified code-bearing HEAD: `c85a46bb31aa559989df3672d3a1e774bad4c51a`. This head includes W63 trusted execution completion, W64 narrowly scoped read-only research completion, W65/W66 direct-table-write hardening, W68 persistent action/spend reservations, W69 one-time JIT dispatch claims, and W70 durable UNKNOWN-outcome reconciliation. No migration from this branch was applied to hosted Development during this verification.

All six automated gates passed on this exact HEAD:

- Web Unit — **PASS, 294/294 tests**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185610604
- Web CI / typecheck / production build — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185610691
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185610679
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185610662
- Netlify Deploy Preview verification — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185610685
- W21 disposable local launch gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185610708

W21 replayed all branch migrations in disposable PostgreSQL 17 and passed pgTAP files W63/W64/W65/W66/W68/W69/W70. It also passed the actual-ledger concurrency proofs:

- W67 same-key idempotency: one durable execution row/event; competing request refused.
- W68 action/spend budget reservation: one winner for one action unit; reservation atomic with start.
- W69 one-time JIT dispatch claim: exactly one claim under concurrency, second claim refused.
- W70 durable reconciliation claim: exactly one leased claim under concurrency, second claim refused.

Browser E2E passed **2/2**. Disposable Supabase cleanup was verified: `remaining_containers=none`, `remaining_volumes=none`, `cleanup_verified=true`. Evidence and diagnostics are attached to [W21 run 38185610708](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38185610708).

### Remaining release gates — unchanged

- **No real provider adapter is wired to the persistent dispatch gateway.** The JIT/budget/reconciliation SQL contracts and gateway seam are tested, but this is not proof of a live provider integration or production external-side-effect enforcement.
- Hosted authenticated Mission Research, citations and persisted history remain **NOT VERIFIED** unless the intentionally gated Development-only live test runs with privately configured dedicated test credentials.
- Actual Resend invitation delivery and hosted password-reset email/callback remain **NOT VERIFIED**.
- Human desktop/mobile visual QA remains **NOT VERIFIED**.
- Supabase Development leaked-password protection remains **WARN / Disabled**; no billing or plan change was made.
- Independent verification and final business outcome commit are not implied by a provider receipt or reconciliation record.

**Release decision:** automated candidate gates are green; full production launch is not approved. PR #29 stays **OPEN / Draft / UNMERGED**. No production deployment, DNS/billing change, or Supabase Main/Production modification was performed. Real provider side effects remain disabled.


---

## Exact-head validation snapshot — W71 / 2026-10-12 — code HEAD `53db9027f56ec7bc12eb835803b83922292b7591`

All six automated gates passed on the same code HEAD. This snapshot records **automated candidate validation**, not production approval.

- Web Unit — **PASS, 302/302 tests**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38218200593
- Web CI / typecheck / production build — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38218200583
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38218200620
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38218200591
- Netlify Deploy Preview verification — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38218200577
- W21 disposable local launch gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38218200611

W21 replayed the migrations in disposable PostgreSQL 17 and passed the Mission Authority SQL regressions for W63, W64, W65, W66, W68, W69, W70 and W71, along with the existing AI quota/plan/workspace security tests. All four independent-session ledger proofs passed:

- W67 idempotency race: one execution row and one start event; duplicates and changed requests are refused.
- W68 persistent authority-budget race: reservation is atomic with execution start.
- W69 one-time JIT dispatch claim: concurrent duplicate claim is refused.
- W70 durable UNKNOWN reconciliation claim: concurrent duplicate claim is refused.

Browser E2E passed **2/2**. Disposable Supabase teardown was verified, including `cleanup_verified=true`; no hosted Development or Production database was targeted. Artifacts: [W21 evidence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38218200611/artifacts/11732607891) and [browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38218200611/artifacts/11732907783).

The W67 helper log now states explicitly that budget-race testing is handled by the separate W68 gate; the old message claiming no atomic budget reservation existed was stale after W68.

### Release boundary remains unchanged

The trusted worker endpoint, persistent budget/start fence, one-time dispatch claim, and durable UNKNOWN reconciliation contracts are implemented and tested in the candidate branch. The provider adapter registry is intentionally empty, so the route fails closed before privileged client creation or provider I/O. These tests do not certify a live provider integration.

Hosted authenticated Mission Research/citations/history, real Resend inbox delivery, human desktop/mobile visual QA, and Supabase Development leaked-password protection remain open release gates. Independent business verification is still required after any future provider receipt. PR #29 remains **OPEN / Draft / UNMERGED**; Supabase Main/Production, production deployment, DNS and billing remain untouched.


---

## W72 integration failure diagnosed; W73 audit-writer fix added — 2026-10-12

On candidate HEAD `253646897424fd9f52f7189c5b3dbec0ce9fd157`, Web Unit, Web CI, Flutter CI, W25 and Netlify Preview passed, but W21 failed at the W72 fake-provider integration. The failure was `claim_agent_execution_dispatch` returning `AUTHENTICATION_REQUIRED` while the service-role worker appended the dispatch audit event. The claim had passed its trusted-role guard; the legacy private mission-event writer was the incompatible user-identity boundary.

W73 adds a strict service-role SYSTEM-event path and regression coverage for valid persisted claims/completions, mismatched or unclaimed rows, forbidden event types, user attribution, workspace denial, and compatibility with W64/W71. W21 is updated to replay the new migration and run the new pgTAP test before W72.

**State:** fix and tests are committed as a single candidate change, but W73/W72 remain **PENDING CI verification** until all gates complete on its exact HEAD. Do not promote production based on earlier green gates while W72 is red.


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


---

## Exact-head verification snapshot — 2026-10-12 — code HEAD `c82e33423b66a959690442c2ca40dcf702a822f5`

All six core automated gates passed on this exact code HEAD. This records isolated candidate validation only; it is not production-release approval.

- Web Unit — **PASS, 306/306 tests**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38228393364
- Web CI / TypeScript / production build — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38228393298
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38228393233
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38228393215
- W21 disposable PostgreSQL 17 launch gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38228393294
- Netlify Deploy Preview verification — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38228393286

### Exact W21 evidence

W21 replayed the repository migrations into disposable PostgreSQL 17 and passed the Mission Authority pgTAP regressions for W63, W64, W65, W66, W68, W69, W70, W71 and W73; it also passed the AI quota/plan/workspace security tests. The W70 test exercised the W74 freshness guard: reconciliation evidence newer than dispatch but older than the active reconciliation claim is rejected, leaving the attempt UNKNOWN, the reservation HELD_UNKNOWN, and the claim token intact.

Independent-session proofs all passed:
- W67: unique idempotency claim and refusal of duplicate/changed requests.
- W68: atomic authority-budget reservation with execution start.
- W69: exactly one JIT dispatch claim.
- W70: exactly one reconciliation claim.

W72 persistent-gateway PostgreSQL integration passed with fake provider adapters only:
`actual_postgres_success_and_budget_settlement=PASS`,
`unknown_to_no_send_reconciliation_without_redispatch=PASS`,
`durable_dispatch_and_reconciliation_audit=PASS`.
Browser E2E passed **2/2**. Disposable-stack cleanup was verified: `remaining_containers=none`, `remaining_volumes=none`, `cleanup_verified=true`.

Artifacts: [W21 evidence and cleanup proof](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38228393294/artifacts/11738335696) · [browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38228393294/artifacts/11737936321).

### Release boundary

The persistent W68–W74 SQL fence and trusted gateway seam are covered by integration tests, but the provider adapter registry intentionally remains empty. The gateway therefore fails closed before privileged client creation or provider I/O when no reviewed adapter is registered. These tests use disposable PostgreSQL and fake adapters; they do not prove any live provider integration.

Still **NOT VERIFIED**: hosted authenticated Mission Research with citations and persisted history; actual Resend invitation delivery; hosted password-reset email/callback; manual desktop/mobile visual QA; Supabase Development leaked-password protection (WARN / Disabled). Independent business verification is not implied by a receipt or reconciliation record.

**Release decision unchanged:** automated candidate gates are green; full production launch is not approved. PR #29 remains OPEN / Draft / UNMERGED. No Supabase Main/Production changes, production deployment, DNS/billing changes or real provider side effects were made.


---

## W75 exact-head validation — 2026-10-12 — `179e9812fb1b787bd162b17a454cb4fdc1f57724`

All six automated PR gates passed on this exact code HEAD. The code change adds **W75 correlatable-provider-receipt enforcement**.

- Web Unit — **PASS, 308/308 tests**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231207800
- Web CI / typecheck / production build — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231207763
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231208031
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231207779
- Netlify Deploy Preview verification — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231207927
- W21 disposable PostgreSQL 17 launch gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231207835

W75 (`supabase/migrations/20261012140000_w75_correlatable_provider_receipt.sql`) adds a database BEFORE UPDATE guard for external-side-effect executions transitioning to `SUCCEEDED`. It requires a bounded top-level scalar provider reference under `id`, `reference`, `request_id`, `message_id`, `transaction_id` or `operation_id`. Status-only/provider-name-only/cost-only receipts and nested identifiers do not qualify. The read-only research path (`external_side_effects=false`) remains exempt from provider-side-effect receipt correlation.

The persistent application gateway applies the same requirement before settling a provider dispatch or authoritative reconciliation result as `SUCCEEDED`; otherwise it preserves `UNKNOWN` and requires reconciliation. Unit tests cover three non-correlatable receipt shapes on both dispatch and reconciliation. The W75 pgTAP test also proves valid string/numeric references are accepted and read-only research remains unaffected.

W21 replayed W75 in disposable PostgreSQL 17; the W75 regression returned **PASS**. W72 integration with fake providers passed, as did independent-session W67/W68/W69/W70 ledger race checks. Browser E2E passed **2/2** and teardown was verified: `remaining_containers=none`, `remaining_volumes=none`, `cleanup_verified=true`.

Evidence: [W21 run](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231207835) · [evidence/cleanup proof](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231207835/artifacts/11738837467) · [browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38231207835/artifacts/11738512759).

**Release decision unchanged:** the tests use fake adapters and disposable PostgreSQL only. The provider registry is still intentionally empty. Hosted authenticated live Research/history, real Resend delivery and password-reset email, human desktop/mobile visual QA, and Supabase Development leaked-password protection remain open. Production launch is not approved. PR #29 stays OPEN / Draft / UNMERGED; Supabase Main/Production and production deployment remain untouched.


---

## W76 exact-head validation — 2026-10-12 — `f986e8ef1d3ce7b40845893e7b0ad3518897366a`

W76 adds a database guard on **both INSERT and UPDATE** for external-side-effect execution rows transitioning to `SUCCEEDED`. A correlatable provider receipt must contain a stable top-level scalar reference; status-only metadata or nested IDs do not qualify. The read-only research path remains exempt because it explicitly has `external_side_effects=false`.

The W21 run initially exposed a stale fixture in W73: it inserted a successful external execution without the receipt now required by W75/W76. The fixture was corrected to include a valid test-only provider reference; the database guard was not weakened. The corrected exact-head run then passed W73, W75 and W76 regressions.

- Web Unit — **PASS, 308/308**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586800
- Web CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586776
- Flutter CI — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586804
- W25 isolated PostgreSQL atomic fence — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586783
- Netlify Deploy Preview verification — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586785
- W21 Local Launch Gate — **PASS**: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38234586774

W21 browser E2E passed **2/2** (2.7 minutes). Disposable cleanup was confirmed: `remaining_containers=none`, `remaining_volumes=none`, `cleanup_verified=true`. W72 persistent-gateway integration and the actual independent-session idempotency, authority-budget, dispatch-claim, and reconciliation-claim race checks passed.

**Release boundary remains unchanged:** the provider adapter registry is intentionally empty until a real adapter has passed review. The trusted gateway fails closed before provider I/O with no reviewed adapter. Tests use fake adapters and disposable PostgreSQL; they do not prove live external-provider integration. Hosted authenticated live Research/citations/history, real Resend delivery, hosted password-reset email/callback, human visual QA, and Supabase Development leaked-password protection (WARN / Disabled) remain open. PR #29 remains OPEN / Draft / UNMERGED; Supabase Main/Production and production deployment remain untouched.


## W79 — trusted read-only research completion — 2026-10-12

A source-level review found that authenticated users could call the bounded read-only research completion RPC directly and submit their own result/citation payload for an execution they owned. W78 tied the history event to that ledger row, but did not independently prove that the server-side provider flow had produced the content.

W79 closes that provenance gap in the source contract: the old authenticated-callable RPC signatures are removed, the replacement completion RPC is callable only by `service_role`, and the API route passes the authenticated requester ID through the trusted server-only client. The database matches that requester to the durable execution and current workspace authority before writing the result. Returned research remains explicitly `verified: false`; this is not independent fact verification.

The corresponding W77 PostgreSQL payload tests now exercise the new trusted signature. A new W79 pgTAP regression suite covers removal of the old signatures, ACLs, client denial, requester-binding mismatch, and successful trusted completion. A route-level source test ensures completion does not use the session-bound Supabase client.

This change requires `SUPABASE_SERVICE_ROLE_KEY` in the Netlify runtime to be configured privately, as already required by the internal trusted-worker endpoint. It does not deploy the migration to hosted Development or Production by this commit: the new migration must first pass isolated PostgreSQL CI. Hosted OpenAI research remains an explicit, separately gated preview test. Production release remains blocked pending all previously documented external and human QA gates.

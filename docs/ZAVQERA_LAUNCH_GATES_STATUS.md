# ZAVQERA launch gates — verified engineering status

Updated: 2026-10-10 13:10 UTC  
Branch: `zavqera/ai-planner-integration`  
PR: [#29](https://github.com/abdalrhmanata-gif/Nexo/pull/29) — **OPEN / Draft / Unmerged**  
Current verified HEAD before this documentation-only update: `6ff11869e5ab8cfa384df8b9d7b25acdd8f5be7c`

## Automated CI — PASS on the verified HEAD

- [Web Unit](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054150228) — PASS.
- [Web CI, authorization tests, TypeScript and production build](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054150218) — PASS.
- [Flutter CI](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054150282) — PASS.
- [W25 isolated PostgreSQL atomic fence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054150226) — PASS.
- [W21 Local Launch Gate](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054150195) — PASS. PostgreSQL 17 disposable migration replay, pgTAP launch gate, AI quota/plan/workspace security suite, full Chromium browser E2E, disposable-stack cleanup and evidence uploads all succeeded.
- [Netlify Deploy Preview checks](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054150199) — PASS for preview routes and real OpenAI mission planning. The authenticated live Mission Research steps were **SKIPPED**, not passed.

W21 artifacts:
- [Evidence](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054150195/artifacts/11670209183)
- [Browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38054150195/artifacts/11670873002)

Automated browser E2E is not the same as a manual visual review of the live UI on desktop and mobile. Manual visual QA remains **NOT VERIFIED** in this release pass.

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

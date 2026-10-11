# ZAVQERA Mission Authority — evidence and next acceptance gate

**Updated:** 2026-10-10  
**PR:** #29 — `zavqera/ai-planner-integration`  
**Reviewed head:** `5ad0f501874840495ac3f8cc19a6b382d312a697`  
**Status:** Acceptance baseline; not production certification.

## Verified on the reviewed head

- Web Unit, Web CI/typecheck/build, Flutter CI, W25 isolated PostgreSQL atomic-fence checks, W21 disposable PostgreSQL/pgTAP/security/browser-E2E gate, and Netlify Deploy Preview route + anonymous OpenAI planning checks completed successfully.
- The live authenticated Mission Research workflow step was **skipped**, because the intentional `[live-openai-research]` marker was not present. Do not record that test as passed.
- PR #29 remains open, Draft, and unmerged.

## Important semantic boundary

The in-memory controlled adapter under `apps/web/lib/mission-authority/controlled-adapter.mjs` is a unit-test model. Its mutex and fake provider can prove local decision logic under tests; they do not prove that the hosted database and independent worker processes share the same atomic authority fence.

Migration W56 correctly changes existing-idempotency behavior in `private.start_agent_execution`: an existing row (including RUNNING) yields `EXECUTION_ALREADY_EXISTS` rather than being returned as permission to dispatch again. This must remain regression-tested.

Migration W49's stale-lease reconciliation changes RUNNING to UNKNOWN with `safe_to_retry: false`. That records uncertainty; it does **not** discover whether the external provider accepted the call. Provider-specific or adapter-neutral evidence lookup and a durable reconciler are still required before an UNKNOWN result can be treated as sent, not sent, or completed.

## Required follow-up acceptance tests

1. **Duplicate dispatch:** two independent database sessions start the same mission/action/agent with the same idempotency key. Exactly one execution row is created; the other receives `EXECUTION_ALREADY_EXISTS` (or the documented bound mismatch), and there is only one authorized dispatch opportunity.
2. **Budget race:** two independent sessions compete for the final budget/action unit. The authoritative durable gate permits at most one.
3. **UNKNOWN after send:** simulate provider acceptance followed by timeout/crash; recovery must query the same provider idempotency/receipt reference and must not dispatch again while ambiguous.
4. **UNKNOWN before send:** only durable evidence that no request crossed the boundary may permit re-authorization; a timeout alone is not proof.
5. **Revocation/approval race:** change or revoke authority after initial planning and before dispatch; dispatch must fail closed at the just-in-time boundary.
6. **Coverage inventory:** trace every real external side effect to the same controlled adapter/JIT authorization contract. Planning calls that only produce drafts must remain separate from execution authority.
7. **Append-only evidence:** record decision, attempt, provider reference, reconciliation and verification without storing secrets or raw credentials.

Run these using disposable PostgreSQL and fake adapters first. Do not add migrations or RPCs until the current execution call graph proves where the smallest missing enforcement point belongs.

## External gates — still not verified

- Authenticated live Mission Research with citation/history persistence requires a prepared dedicated Development-only test account and paired GitHub Actions secrets. Enable its one-run marker only when intentionally ready; the test writes durable records to Development.
- Real invitation-email delivery requires Resend configured in Netlify Deploy Previews only and provider delivery/bounce evidence.
- Password-reset email and hosted callback flow require an end-to-end preview test.
- Manual live desktop/mobile visual review remains separate from automated browser E2E.
- Development leaked-password protection remains WARN/Disabled; defer paid-plan changes as previously decided.
- Do not modify Supabase Main/Production, merge the PR, mark it Ready, or deploy Production without explicit authorization and the required evidence.

## Current decision

Automated gates are green on the reviewed head. Overall product launch remains **BLOCKED** by the unverified hosted integrations and incomplete proof of the universal external execution authority/reconciliation boundary.

## Reconciliation hardening — 2026-10-11

The isolated fake-adapter seam now distinguishes an authoritative provider
receipt, explicit proof that a request was not sent, and an inconclusive lookup.
A missing record alone leaves the attempt `UNKNOWN`; replay remains blocked until
reconciliation produces evidence. This closes a unit-model ambiguity only. It
does not provide durable evidence across workers or prove provider-specific
reconciliation semantics. No migration, RPC, hosted project, or live provider
was changed for this follow-up.

## Dispatch-result classification and CI safety — 2026-10-11

- The controlled adapter now treats provider-reported `FAILED` as `DENY`, and only treats `ACCEPTED` / `SUCCEEDED` as successful dispatch outcomes.
- Missing, malformed, or unrecognized dispatch results remain `UNKNOWN` and require reconciliation. A dispatch result cannot self-assert `RECONCILED_NOT_SENT`; only the reconciliation path may accept explicit no-send evidence. Regression tests cover provider failure and a forged no-send claim.
- The Netlify preview workflow's real OpenAI planning smoke test is now opt-in via the exact `[live-openai-planning]` marker in the same-repository PR body. Ordinary PR updates no longer make this live provider call. The separately gated authenticated Mission Research test remains controlled by `[live-openai-research]`.
- These changes are recorded on the PR branch at `c882ba52049aeae06f88265cdb030d45d4850a5d`. CI must complete on the final updated HEAD before this follow-up is considered verified; no live OpenAI planning request was intentionally invoked by this change.

## Follow-up evidence — 2026-10-11 — HEAD `3086220616ea8d4493e15afbb585af8a69c55b8c`

All six core PR gates passed on this exact HEAD; PR #29 remains OPEN / Draft / UNMERGED:

- Web Unit: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38130708465
- Web CI / TypeScript / production build: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38130708489
- Flutter CI: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38130708500
- W25 isolated PostgreSQL atomic fence: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38130708494
- W21 Local Launch Gate: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38130708555
- Netlify Deploy Preview workflow: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38130708581

W21 reported both browser scenarios passed and verified disposal cleanup. Artifacts:
- Browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38130708555/artifacts/11698283558
- Evidence and cleanup proof: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38130708555/artifacts/11698373437

Netlify preview route checks passed. The real OpenAI planning and authenticated live OpenAI research steps were skipped because the explicit opt-in markers were not present. Playwright screenshot capture is now set to `only-on-failure`; this run did not emit the previously observed `step id not found` internal reporter message and both E2E scenarios passed.

These CI results verify the exercised isolated test harness and routes, not a universal production external-side-effect gateway, hosted Mission Research persistence, or real invitation email delivery. Supabase Main/Production was not changed.

## Trusted completion boundary and final W21 evidence — 2026-10-11

**Implementation head tested:** `60d72966e8e033fc016442e99f43997cf9c442f1`  
**PR:** #29 remains OPEN / Draft / UNMERGED. The follow-up commit after this evidence is documentation-only; it does not alter application code, migrations, workflows, or provider configuration.

### W63 — generic execution completion is trusted-worker-only

- `public.complete_agent_execution` and its private implementation are executable by `service_role`, not by `authenticated` or `anon` callers.
- A `SUCCEEDED` result requires non-empty structured `provider_receipt` evidence. Empty or nested-empty receipt objects are rejected.
- A worker cannot finalize a RUNNING execution after its lease expires; the attempt must go through reconciliation.
- Regression test: `supabase/tests/w63_trusted_execution_completion.sql` — **PASS** in the disposable PostgreSQL 17 launch gate.

### W64 — bounded read-only research recording

- The dedicated research completion RPC is limited to the requesting user's own execution, an active `read_only` agent with `external_side_effects=false`, a research request with a matching request ID, no action ID, and an unverified result.
- Successful results are shape-checked (summary and source count, at most 12 source entries, bounded titles/URLs); exact completion replays are idempotent. Expired leases and attempts to claim independent verification are rejected.
- Regression test: `supabase/tests/w64_read_only_research_completion.sql` — **PASS** in the disposable PostgreSQL 17 launch gate.
- **Important limitation:** this narrow user-scoped RPC records results as `verified=false`; it does not independently prove that the AI provider generated the result. Do not treat its output as verified evidence or extend this authenticated path to agents with external side-effect authority. Provider provenance and the universal just-in-time external execution/reconciliation boundary remain separate acceptance requirements.

### Final automated evidence on the tested implementation head

All six core PR gates passed:

- Web Unit: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38142661247
- Web CI / typecheck / production build: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38142661361
- Flutter CI: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38142661300
- W25 isolated PostgreSQL atomic fence: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38142661331
- W21 Local Launch Gate: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38142661262
- Netlify Web Deploy / preview verification: PASS — https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38142661444

W21 details: both browser scenarios passed (`2 passed`); W63 and W64 pgTAP tests passed; the AI quota/plan/workspace security tests passed; disposable Supabase cleanup verified `remaining_containers=none`, `remaining_volumes=none`, and `cleanup_verified=true`.

- W21 evidence and cleanup proof: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38142661262/artifacts/11703488092
- W21 browser diagnostics: https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38142661262/artifacts/11702658945
- Netlify Deploy Preview: https://deploy-preview-29--unique-kringle-3ce321.netlify.app/app

The real OpenAI planning and authenticated live OpenAI research checks remained skipped because the explicit opt-in markers were not present. Vercel status contexts still report the account's build-rate limit; Vercel was not used or modified. Netlify is the active preview path and its deploy-preview status is successful.

**Launch decision remains BLOCKED.** These results prove the tested isolated harness and bounded routes, not production readiness, real provider provenance, hosted authenticated research persistence, invitation-email delivery, or a universal external-side-effect authority gateway. Supabase Main/Production was not changed, and PR #29 was not merged or marked ready.

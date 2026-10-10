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

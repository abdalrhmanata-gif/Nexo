# ZAVQERA outbound-effect entry-point inventory — 2026-10-12

**Branch:** `zavqera/ai-planner-integration`  
**PR #29:** OPEN / Draft / UNMERGED  
**Purpose:** source-level inventory supporting Issue #23. This is not a runtime/network trace and must not be described as proof that every external side effect is mediated by Mission Authority.

## Inventory

| Entry point | Outbound effect | Existing controls | Mission Authority JIT status |
|---|---|---|---|
| `apps/web/app/api/ai/plan/route.ts` → `apps/web/lib/ai-planner.ts` | Calls OpenAI Responses API to draft a mission plan. | Authenticated route, plan/workspace checks, AI quota reservation and settlement via `apps/web/lib/ai-usage.ts`, provider outcome classification in `apps/web/lib/ai-generation-service.mjs`. Mock provider is not permitted in production runtime. | **Separate provider-cost operation, not a mission action dispatch.** No evidence that this planning call goes through the Mission Authority JIT gateway; do not use it as proof of external-action enforcement. |
| `apps/web/app/api/ai/plan/anonymous/route.ts` → `apps/web/lib/ai-planner.ts` | Calls OpenAI to produce an anonymous draft plan. | Anonymous usage reservation keyed to visitor/IP/request ID; production forces real provider mode; uncertain outcomes preserve the reservation to avoid blind retry after possible provider spend. | **Separate draft-generation operation.** It must not execute a mission action. It is not proof of the universal JIT action boundary. |
| `apps/web/app/api/missions/[id]/research/route.ts` → `apps/web/lib/ai-research.ts` | Calls OpenAI for bounded, read-only mission research; also makes internal trusted-worker calls for schema preflight and trusted completion. | Authenticated mission access; active read-only agent check and `external_side_effects === false`; AI quota reservation; requester-bound execution; schema-signature preflight before provider spend; fail-closed handling of uncertain outcomes; W79 service-role-only trusted completion records `verified: false`. | **Bounded read-only research path, not permission to perform external actions.** Hosted Research remains NOT VERIFIED because hosted Development was last checked at W65 and does not have the W79 signature. Do not run it on hosted Development without separate authorization. |
| `apps/web/app/api/business/invitations/route.ts` | Sends workspace invitation email through `https://api.resend.com/emails`. | Authenticated workspace role checks; configuration required; token hash stored rather than raw token; expiry and invitation record; stable idempotency key; provider errors do not imply inbox delivery. | **A real external effect outside the Mission Action gateway.** It is a workspace-admin workflow, not a delegated mission action. Real inbox delivery remains NOT VERIFIED and requires a separate preview-only test. |
| `apps/web/components/auth-form.tsx` | Calls Supabase Auth `signUp`, `signInWithOAuth`, and `resetPasswordForEmail`; confirmation/reset messages may be sent by Supabase Auth. | Supabase Auth owns the identity/email flow; app callback routes handle confirmation and reset callbacks. | **Identity-provider effects, outside Mission Action JIT.** Confirmation and password-reset delivery/callback verification remain NOT VERIFIED. |
| `apps/web/app/api/internal/agent-executions/[executionId]/route.ts` | The only reviewed candidate route that can call the persistent dispatch/reconciliation gateway for mission execution. | Token-protected worker; exact operation/audience validation; `resolveTrustedDispatchAdapter`; fails with HTTP 503 before client construction/claim when no adapter exists; dispatch and reconciliation functions are distinct. | **Fail-closed; currently no real provider call is possible through the registry.** `apps/web/lib/mission-authority/provider-adapter-registry.mjs` intentionally exports an empty frozen registry. |
| `apps/web/lib/mission-authority/persistent-dispatch-gateway.mjs` | Performs the persisted JIT claim, then invokes an injected trusted adapter; reconciliation only calls provider lookup. | One-time claim; audience binding; immutable claim envelope; unknown outcome stays reconciliation-required; no blind dispatch retry; receipt correlation and fresh reconciliation evidence. | **Candidate seam with isolated fake-provider tests only.** The module comment explicitly says no route currently wires a real provider; this is not universal production enforcement. |
| `apps/web/app/api/agent-executions/[executionId]/route.ts` | Starts/records/cancels/retries execution state via guarded Supabase RPCs. | RPC boundary and status mapping; explicit conflicts for duplicate attempts, unknown outcome, retry creation and held budget. | **Execution state-control route, not provider I/O.** It must not be treated as the dispatch gateway. Verify its RPCs remain guarded in the migration/pgTAP suite. |

## What this inventory proves—and does not prove

- The branch has several intentional outbound integrations (AI planning, read-only research, Resend invitations and Supabase Auth) that are **not** Mission Action dispatches. They have their own authorization/quota/token controls, but they are not all governed by the Mission Authority JIT gateway.
- The actual mission-action worker route is fail-closed today because no trusted provider adapter is registered. This is the safe current state.
- The persistent gateway and SQL candidate controls have passing isolated tests on code/test SHA `7a2e559d3f6c3a91b69bce387f2adf98c17ee3d7`, including W21 run https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38289544742. Fake-adapter success is not real-provider certification.
- Hosted Development was last read-only verified at W65; W66–W79 remain absent from the hosted migration ledger. No hosted migration was applied as part of this inventory.
- The current inventory is source-based. A final acceptance pass must still search all reachable application/server modules and dependencies for outbound HTTP/SDK calls, prove there are no unclassified mission-action entry points, and tie each external side effect to its intended authorization boundary.

## Next acceptance actions

1. Keep the provider registry empty and the internal dispatch route fail-closed.
2. Search and review all reachable `fetch`, provider SDK, email, webhook, queue and callback call sites, including transitive helper modules, and add any newly found entry points to this inventory.
3. For Mission Action execution specifically, add an explicit route-level regression proving no action can reach provider I/O without a registered reviewed adapter and a persisted JIT claim; prove the negative path performs zero provider calls.
4. Add exact tests for changed action/input/destination, stale/revoked authority, missing approval, provider/model replacement without authority expansion, and cross-tenant denial.
5. Keep hosted migration rollout, live Research, Resend inbox delivery, password reset verification and real-provider adapter certification separately authorized.

## Safety

No hosted database was changed, no hosted Research or real mission provider call was executed, and no production deployment, DNS/billing change, Git `main` change, or PR merge occurred. Issue #23 remains OPEN and production readiness remains NOT APPROVED.

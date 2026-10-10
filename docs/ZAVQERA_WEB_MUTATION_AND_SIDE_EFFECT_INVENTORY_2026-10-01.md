# ZAVQERA Web Mutation & Side-Effect Inventory — 2026-10-01

**Branch:** `zavqera/alternative-web-deployment`  
**Method:** Read-only source inspection of the concrete Next.js API routes, server repository and client mutation callers retrieved from GitHub.  
**Purpose:** Complete the next gate from the Mission Authority source audit without inventing a database schema or adding an unused authorization layer.

## Concrete mutation surface

| Route | Method | Operation | Server boundary observed |
|---|---|---|---|
| `/api/missions/[id]` | PATCH | mission objective/status | Authenticated Supabase server client; workspace-scoped repository; authoritative versioned RPCs for transitions/details |
| `/api/missions/[id]` | DELETE/POST override | mission deletion | Authenticated Supabase server client; workspace ownership filter; database history FK prevents deletion when provenance exists |
| `/api/missions/[id]/actions` | POST | add action | Authenticated repository; mission is re-read with workspace ownership before insert; RLS remains authoritative |
| `/api/missions/[id]/actions/[actionId]` | PATCH | action status/follow-up | Mission is loaded through the authenticated workspace repository; authoritative versioned action RPC is used |
| `/api/missions/[id]/verification` | POST | create verification | Authenticated repository; verification RPC performs the durable mutation and server-side checks |
| `/api/missions/[id]/outcome` | POST | commit outcome | Authenticated repository; outcome RPC requires the exact verification id and server-side acceptance rules |

## Important finding: no real external side-effect path exists in the reviewed web surface

The reviewed Next.js routes mutate ZAVQERA's own mission state only. They do **not** call a provider API, browser automation service, payment service, webhook target, AI tool, or external side-effect adapter.

The existing Flutter `ExecutionGateway`/demo-adapter path remains a client/demo execution model; the repository documentation explicitly says it is not the production authorization boundary.

Therefore adding a generic server-side authorization class to the current web mutation routes would not solve the identified Mission Authority gap. The correct enforcement seam is the first actual server/worker adapter that is allowed to cross from ZAVQERA state into an external side effect.

## Controls verified in source

- Web server mutations obtain the Supabase user from the server-side session rather than trusting a client-supplied user id.
- Mission reads/writes are workspace-scoped and backed by Development RLS/ownership policies.
- Mission/action state transitions use expected-version RPCs for stale-write protection.
- Verification and outcome writes are routed through reviewed RPCs rather than raw direct inserts from the web route.
- Raw database error details are generally not returned to callers by the API routes.
- Client UI state restrictions are advisory; the authoritative mutation checks remain server/database-side.

## Remaining Mission Authority gap

Still **not proven**:

1. A production server/worker JIT decision immediately before external I/O.
2. Atomic lease/revocation/policy/budget enforcement at that boundary.
3. Durable side-effect attempt + idempotency handling.
4. UNKNOWN-result reconciliation with a real adapter.
5. A proof that every external side-effect entry point is routed through the same controlled boundary.

## Decision

**Do not change the current web mission CRUD/verification routes for Mission Authority yet.** They are not the external execution boundary.

The next implementation should be a deliberately isolated **server-side controlled-adapter seam with a fake external system**, and it should be introduced together with negative/concurrency tests. No production provider credentials and no hosted Development E2E are required for that first slice.

No database, deployment, billing, protected branch, or Supabase Main change is part of this inventory.


---

## Follow-up source audit — 2026-10-10 (W56 / hosted Development verification)

This follow-up supersedes the earlier statement that the reviewed web surface has no real external side-effect path. The original inventory correctly described the source reviewed on 2026-10-01, but the feature branch now includes an authenticated Mission Research route that calls OpenAI.

### Newly confirmed external provider path

| Route / source | External side effect | Current enforcement | Assessment |
|---|---|---|---|
| `apps/web/app/api/missions/[id]/research/route.ts` POST | Sends a mission research request to OpenAI in production runtime (mock provider is restricted to non-production) | Authenticated mission repository lookup; AI quota reservation; calls `start_agent_execution` in the `prepare` callback before provider generation; maps approval denial to 409; marks duplicate attempt as conflict; records execution completion and research history when those writes succeed | **Partial JIT gate for this research route only**, not a universal Mission Authority gateway |
| `apps/web/lib/ai-generation-service.mjs` | Coordinates reservation, pre-dispatch preparation, provider call and settlement | Known pre-dispatch denial releases quota; duplicate/unknown outcome keeps reservation held; settlement failure does not release quota | **Useful fail-closed accounting**, but not proof of full durable cross-worker reconciliation |
| `supabase/migrations/20261010125620_w56_agent_execution_duplicate_dispatch_guard.sql` | Database guard for agent execution idempotency | Existing matching idempotency key raises `EXECUTION_ALREADY_EXISTS`; mismatched mission/agent/action raises `EXECUTION_IDEMPOTENCY_BINDING_MISMATCH`; approval requirement is checked before a new execution row is inserted | **Duplicate-dispatch protection verified in Development**; does not by itself implement all contract bindings |

### W56 evidence and environment boundary

- Hosted ZAVQERA Development project `mrwmmbytcymqgwvcoywd` records migration version `20261010125620` as `w56_agent_execution_duplicate_dispatch_guard`.
- Read-only catalog verification found the guard in `private.start_agent_execution(uuid,uuid,uuid,text,jsonb)`; `anon` cannot execute the function and `authenticated` can.
- On PR HEAD `ccf2cea7c5ef3901908a798a99c4591b7ad6fd0a`, Web Unit, Web CI/build, Flutter CI, W25, W21 and Netlify Deploy Preview all completed successfully. W21 includes disposable PostgreSQL 17 migration replay, pgTAP, quota/plan/workspace security checks, full Chromium E2E, cleanup and evidence upload.
- The Netlify workflow's authenticated live Mission Research steps were skipped because the explicit `[live-openai-research]` marker is absent. Therefore live hosted research, citations/history persistence and its real authenticated route remain **NOT VERIFIED**. Do not infer these from the real OpenAI mission-planning smoke test.

### Exact remaining enforcement gaps

The Research route's current `start_agent_execution` call binds mission, agent, action (currently null), request ID and a small request descriptor. The inspected request does not yet bind the full contract tuple of action revision/input hash, authority revision, active lease, policy version, exact destination/audience, and atomic spend/action budget at the same enforcing boundary. The route is also one external-provider path, not proof that every future adapter or external side effect must use a common provider-neutral JIT gateway.

The current attempt row and UNKNOWN handling are useful safety primitives, but they do not yet prove reconciliation with a real provider after every timeout/crash window. In particular, a successful provider response followed by failure to record execution completion must remain an inspect/reconcile case and must never be treated as permission to dispatch again.

### Revised decision

- Keep the older 2026-10-01 findings as a historical baseline; use this follow-up as the current status.
- Do not label Mission Authority production-certified.
- Continue implementation against Issues #23–#25 in an isolated fake-adapter/contract-test seam, with the existing web research route treated as a first partial integration rather than universal enforcement.
- No Supabase Main/Production change, production deployment, DNS or billing change was made in this follow-up.


## Inventory completeness correction — 2026-10-10

A further source pass found additional real provider calls and one external email side effect. The phrase “one confirmed real external provider path” in the earlier W56 follow-up refers only to the Mission Research route and must not be read as a complete inventory.

| Route / source | External boundary | Current controls | Remaining limitation |
|---|---|---|---|
| `apps/web/app/api/ai/plan/route.ts` POST | OpenAI Responses API for authenticated draft planning | Authenticated user required; goal bounded to 2,400 chars; AI quota reservation/settlement; timeout/unknown failures hold quota | Does not create an agent execution attempt or invoke the Mission Authority JIT gate. This is draft generation, not authorization to perform the proposed actions. |
| `apps/web/app/api/ai/plan/anonymous/route.ts` POST | OpenAI Responses API for anonymous draft planning | Goal bounded to 900 chars; visitor/IP hashes; anonymous quota reservation; timeout/unknown failures do not release the reservation; no tool execution is offered | No durable Mission Authority attempt journal. Keep the returned plan explicitly draft-only; do not interpret this endpoint as action execution. |
| `apps/web/app/api/missions/[id]/research/route.ts` POST | OpenAI Responses API with required web search | Authenticated mission lookup; quota reservation; execution/approval gate before provider call; W56 duplicate-key rejection; execution evidence/history writes | Partial gate for this route only; exact action/input hash, authority revision, lease, policy version, destination/audience and cross-worker reconciliation are not yet proven together at one atomic boundary. |
| `apps/web/app/api/business/invitations/route.ts` POST | Resend email API sends a workspace invitation | Server-side role validation, authenticated workspace repository path, trusted-origin checks, escaped email content, idempotency key, hashed invitation token and expiry | Real delivery is not verified. This is a user/admin-initiated email action, not an agent-authorized Mission action; still requires a real delivery test and should never claim inbox delivery solely from provider acceptance. |

The source inventory now distinguishes (a) AI provider requests that send user-provided mission content outside ZAVQERA, (b) the gated read-only research operation, and (c) human/admin-triggered email delivery. The two planning endpoints must remain draft-only and must not gain tool execution implicitly. Any future agent tool or external side effect must use the shared server-side authority boundary rather than treating planner output or a provider response as permission.

No runtime code, hosted schema, Production, DNS, or billing was changed by this inventory correction.

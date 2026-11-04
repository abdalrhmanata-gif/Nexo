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

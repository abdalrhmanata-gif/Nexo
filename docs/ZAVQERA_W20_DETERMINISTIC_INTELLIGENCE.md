# ZAVQERA W20 — deterministic intelligence foundation

Baseline: `cf445d1`  
Branch: `zavqera/alternative-web-deployment`  
Database target: ZAVQERA Development only

## Cancelled-action semantics

The authoritative completion guard in W9.1 used `status <> 'COMPLETED'`. Since
`mission_actions.status` also includes `CANCELLED`, a cancelled action was
counted as outstanding work and `commit_verified_mission_outcome` raised
`ALL_ACTIONS_MUST_BE_COMPLETED`.

W20 adopts the product rule that cancellation removes an action from required
work without deleting its row or its event history. The migration changes only
that predicate to exclude both `COMPLETED` and `CANCELLED`. Authentication,
owner checks, verification checks, row locks, version/lifecycle transitions,
the pinned `search_path`, grants and audit events remain authoritative.

Migration: `supabase/migrations/20260929210000_w20_cancelled_action_completion_semantics.sql`

## Deterministic intelligence

`apps/web/lib/mission-intelligence.mjs` is provider-neutral and reads only the
trusted mission view model. It contains:

* `nextActionFor` — structured current state, next action, reason, blocker,
  priority, context and action id.
* `planHealthFor` — structured factual findings for no actions, overdue
  follow-ups, all remaining work waiting, apparent completion, missing
  verification, missing outcome and contradictory completion state.
* `missionIntelligenceFor` — the combined result used by the mission detail
  page.

The UI presents “What should I do next?” and “Plan health” without calling a
model or claiming facts that are not in persisted state. Cancelled actions are
visible in the action history but are never selected as unfinished work.

Intent, success criteria and actions remain separate parsed/composed concepts.
No LLM, autonomous execution, external integration, service-role credential or
browser-side authority was added.

## Verification

`npm test`: **93/93**  
`npm run typecheck`: clean  
`npm run lint`: clean  
`npm run build`: clean

The regression suite covers all requested deterministic states, cancelled
action visibility/semantics, ownership guardrails and preservation of the
verification/outcome lifecycle.

## Release status

The migration must be applied and exercised against ZAVQERA Development before
W20 can be called PASS. This environment has no database migration credential,
so a live SQL-level completion test is intentionally not claimed here.

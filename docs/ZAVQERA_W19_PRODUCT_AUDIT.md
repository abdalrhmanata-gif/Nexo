# ZAVQERA W19 — Product audit and beta hardening

Baseline: `8916a14`. Branch: `zavqera/alternative-web-deployment`.
Database: ZAVQERA Development. `main`, Supabase Main and PRs #12/#19/#20 untouched.

## How this audit was done

The product was read as a user path, not as a file list: mission creation →
workspace → mission detail → action lifecycle → Waiting → follow-up →
verification → outcome → deletion, cross-checked against the SQL that actually
enforces each step. Documentation was not trusted; the migrations were read.

That is how the defects below surfaced. None of them were visible to the
existing 59 tests, because every test asserted the behaviour of a unit rather
than the reachability of the journey.

## Defects found and fixed

| # | Class | Defect | Fix |
|---|---|---|---|
| 1 | Correctness — data loss | The mission edit form was prefilled with `mission.intent` but submitted `objective`, which stores the name, the intent **and** the success criteria in one column. Every save silently erased the mission name and all criteria. | The form now edits name, intent and criteria as separate fields and recomposes all three through `composeMissionObjective`. |
| 2 | Workflow — dead end | `create_mission_verification` and `commit_verified_mission_outcome` both reject unless the mission is `VERIFYING`. The UI offered both forms in every state, so Verification and Outcome were unreachable for any normal user. | `verificationReadiness` derives from persisted state whether evidence can be recorded, and otherwise explains the route and names the blocking actions. |
| 3 | Workflow — dead end | Actions could only be created with the mission. The product told users "Add the work this mission needs" with no control to do it. | `POST /api/missions/[id]/actions` and an add-action control, using the same workspace-scoped insert mission creation already uses. |
| 4 | Correctness | `listMissions` loads no verification or outcome history, so `nextStepFor` asked finished missions to "Record verification". | `nextStepFor` now reads lifecycle state, which the list already loads, and reports closure for terminal missions. |
| 5 | Error quality | Verification and outcome handlers returned `error.message` verbatim, surfacing raw labels such as `MISSION_NOT_VERIFYING` to the user. | Both route through `throwMutationError`; every known rejection maps to a sentence and returns 422. Anything unmapped returns a generic 403 rather than leaking the database. |
| 6 | Workflow | The mission state control listed all twelve raw enum values, most of them illegal from any given state. | Human labels, and only transitions the database allows. A test asserts the mirror equals the SQL table exactly. |
| 7 | Workflow | Success criteria doubled as the action list, conflating "what good looks like" with "the work". | Separate optional "First steps" field. Omitting it still seeds actions from the criteria, so existing behaviour is preserved. |
| 8 | Navigation | `.topbar nav a:not(.button) { display:none }` hid the Workspace link on mobile, and the new-mission page had no way back. | Link kept on mobile; breadcrumb and Cancel added to the new-mission page. |
| 9 | Presentation | Outcome showed a bare `success_score` of `0.85`; the sidebar showed a raw lifecycle enum. | Score rendered as a percentage with a plain-language result; state rendered through `missionStatusLabel`. |

## Not changed, deliberately

* **No schema or RPC change.** Every defect above was in the web layer. The
  authoritative contract, RLS, version fencing and ownership rules are untouched.
* **No AI, agents, payments or integrations.** Out of scope for W19.
* **`ALL_ACTIONS_MUST_BE_COMPLETED` treats a cancelled action as blocking.** A
  mission with a cancelled action cannot be completed. That is a database rule,
  not a UI bug; it now produces a clear message instead of a raw label. Whether
  the rule itself is right is a W20 product question.

## Verification

`npm ci` clean · `npm test` **83/83** (was 59) · `npm run typecheck` clean ·
`npm run lint` clean · `npm run build` clean, 15 routes + middleware.

Security sweep: no `service_role` in application source, no credential logging,
no direct `.from(...).update(...)` in the repository, open-redirect guard intact.

## Regression coverage added

`apps/web/test/product-experience.test.mjs` — 24 tests, one group per defect,
including a test that extracts the mission transition table from the W8
migration and asserts the client-side mirror matches it exactly, so the two
cannot drift.

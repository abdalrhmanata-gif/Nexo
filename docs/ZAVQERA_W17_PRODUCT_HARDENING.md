# ZAVQERA W17 — MVP product hardening

Stage 2, work package W17. Baseline: `e402bb1` (the commit validated by a real
user in Stage 1). Branch: `zavqera/alternative-web-deployment`. No schema
change, no new dependency, no framework change, no change to `main` or to
Supabase Main.

## Why these changes

The audit of the existing product found six defects where the interface either
restated internal state or asserted things the database never recorded.

| # | Defect | Effect on a real user |
|---|---|---|
| 1 | The creation form composed `name\n\nintent\n\nSuccess criteria:\n…` into the single `objective` column, and nothing parsed it back. `intent` was set to the whole blob. | Every mission card and detail page repeated the title and printed the literal text `Success criteria:` inside the intent paragraph. |
| 2 | `criteria` was derived as `actions.map(a => a.title)` and was never rendered. | The stated definition of done was captured at creation and then silently discarded. |
| 3 | `risk: "LOW"` and `budget: "Not set"` were hardcoded in the repository and rendered as if persisted. | The interface asserted facts the system had never recorded. |
| 4 | Activity events rendered `JSON.stringify(payload)`. | Users read raw server state, including internal field names. |
| 5 | `listMissions` hydrated each mission separately (~4N queries). | The workspace got slower with every mission added. |
| 6 | Action status was shown as the raw enum (`PENDING`, `BLOCKED`) and otherwise conveyed by colour alone. | "Blocked" read as failure rather than waiting, and colour-only status is inaccessible. |

## What changed

**`lib/mission-content.mjs` (new).** A single owner for the stored objective
format. `composeMissionObjective` writes it, `parseMissionObjective` reads it,
so the two can no longer drift; free-form and legacy objectives still yield a
usable title. It also provides human action-status labels and hints, the
deterministic next step, and a field-whitelisted event summary.

**Data layer.** `toMission` reports the real name, intent and criteria, emits
`actionsTotal`/`actionsCompleted`, computes progress over *resolved* actions so
a cancelled action cannot pin a mission below 100%, and no longer invents
`risk` or `budget` (both removed from the type). `listMissions` batch-fetches
actions with a single `.in("mission_id", …)`.

**Interface.** The workspace leads with what needs attention, drawn from real
mission state, and explains a failed delete instead of returning a raw JSON
body to a plain form submission. The detail page adds the success-criteria
section, a next-step banner, human action statuses with hints — including that
Waiting is explicitly *not* complete — empty states for every section, and a
sidebar of real facts where Budget and Risk used to be. Focus styles are
visible and the new elements collapse cleanly on narrow screens.

## Verification

`npm test` 34/34 pass · `npm run typecheck` clean · `npm run lint` clean ·
`npm run build` succeeds (14 routes + middleware). No `service_role` reference
and no auth/session debug logging in `app`, `lib`, `components` or
`middleware.ts`.

## Deliberately deferred to W18

`follow_up_at` exists on `mission_actions` with a partial index, but
`transition_mission_action(p_action_id, p_to_status, p_expected_version)` does
not accept it. Persisting a follow-up date needs a new RPC and migration.
There are no Supabase credentials in this environment, so a committed but
unapplied migration would break the live application. Surfacing the column
read-only would show an always-empty field. The next work package should add
the RPC and migration together, then expose the field.

## Owner action required

Real-user validation of these changes on the branch deployment. Automated
checks cannot confirm that the interface now reads clearly to a person.

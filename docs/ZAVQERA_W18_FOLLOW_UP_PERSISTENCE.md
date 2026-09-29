# ZAVQERA W18.1–W18.6 — Follow-up persistence

Baseline: `c605088`. Branch: `zavqera/alternative-web-deployment`.
Migration: `supabase/migrations/20260929180000_w18_action_follow_up_persistence.sql`.

## What the inspection found

W17 deferred this item on the assumption that a schema change would be needed.
Inspecting the schema showed that it is not:

* `mission_actions.follow_up_at timestamptz null` already exists (W4).
* `mission_actions_follow_up_at_idx`, a partial index on non-null values,
  already exists (W4).
* `revoke update on table public.mission_actions from authenticated` (W7) means
  the RPC is already the **only** write path.

So the column was never the gap. The gap was that
`transition_mission_action(uuid, text, bigint)` had no parameter able to carry a
date, so nothing could ever write to the column. The smallest correct change is
therefore to extend the existing authoritative RPC — no new table, no new
column, no new index, no second contract, no client-side write path.

## The change

The RPC is replaced by a superset of itself:

```
transition_mission_action(
  p_action_id       uuid,
  p_to_status       text,
  p_expected_version bigint,
  p_follow_up_at    timestamptz default null,
  p_set_follow_up   boolean     default false
)
```

It is *replaced* rather than overloaded on purpose: two functions differing only
by defaulted trailing parameters would make the existing three-argument call
ambiguous. Because both new parameters have defaults, the pre-W18 call site
continues to work unchanged and, critically, **a caller that omits them cannot
alter a follow-up date**.

`p_set_follow_up` exists because `null` is a legitimate value. Absent means
"leave the stored date alone"; `p_set_follow_up = true` with a null date means
"remove it". The web layer mirrors this: the JSON key `followUpAt` is omitted
for a plain status change and set to `null` to clear.

### Semantics, enforced in the database

* A follow-up date only exists while an action is `BLOCKED` ("Waiting").
  Requesting one for any other target status raises `FOLLOW_UP_REQUIRES_WAITING`.
* Any transition out of `BLOCKED` — including `COMPLETED` and `CANCELLED` —
  clears the date, and both the old and new values are written to
  `mission_events`. The date is never lost silently; it becomes provenance.
* Remaining in `BLOCKED` preserves the date unless the caller explicitly sets
  one. `BLOCKED → BLOCKED` is accepted *only* as an explicit follow-up edit, and
  still consumes a version so it stays fenced.
* Dates more than a day in the past (`FOLLOW_UP_IN_PAST`) or more than ten years
  ahead (`FOLLOW_UP_TOO_DISTANT`) are rejected.

### Preserved unchanged

Authentication check, ownership derived from `auth.uid()` (never from a
client-supplied id), `for update` row locking, optimistic version fencing and
its `STALE_VERSION` contract, `security definer` with a pinned `search_path`,
and `revoke … from public, anon` / `grant execute … to authenticated`.

### One transition added

`BLOCKED → RUNNING`. Resuming waiting work previously required a detour through
`PENDING`, which made "Waiting" behave like a dead end. This only adds a legal
edge; no existing edge was removed or altered.

A `not valid` check constraint records the invariant in the schema as defence in
depth. `not valid` means no existing row is examined or rewritten by the
migration.

## Behaviour before the migration is applied

The two new parameters are sent **only** when a follow-up is actually being
changed. A plain status change therefore issues the exact pre-W18 three-argument
call and is unaffected by deployment ordering.

If a follow-up is attempted against a project where the migration has not been
applied, PostgREST returns `PGRST202` (unknown function signature). The app
surfaces that as an explicit operator error — *"Follow-up dates are not
available on this environment yet. The pending database migration must be
applied first."* — and returns HTTP 422. It never silently drops the date and
never falls back to local storage.

## Current environment state (verified, not assumed)

Probed against ZAVQERA Development (`mrwmmbytcymqgwvcoywd`) using the public
publishable key, from the deployed branch build:

| Probe | Result | Meaning |
|---|---|---|
| `transition_mission_action` with the five W18 parameters | `404 PGRST202` — "no matches were found in the schema cache" | the migration is **not applied yet** |
| `transition_mission_action` with the three pre-W18 parameters | `401 42501` — "permission denied for function" | the existing RPC is intact and still correctly closed to `anon` |

This confirms two things. The migration genuinely still needs to be applied by
an operator with credentials, and the deployed application has **not** regressed:
because the new parameters are only sent when a follow-up is actually being
changed, every existing status change continues to use the three-argument
signature that is present and working.

It also confirms the error path is real rather than theoretical — `PGRST202` is
exactly the code the repository maps to the operator message.

## Applying the migration (ZAVQERA Development only)

Requires credentials that are not present in the build environment.

```
supabase link --project-ref mrwmmbytcymqgwvcoywd
supabase db push
supabase migration list --linked      # confirm the W18 entry is applied
supabase db advisors --linked         # expect no new findings
```

Then confirm the signature exists:

```sql
select p.oid::regprocedure
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'transition_mission_action';
-- expect: transition_mission_action(uuid,text,bigint,timestamp with time zone,boolean)
```

Do **not** run this against Supabase Main.

## Rollback

The migration adds no data and removes none, so reverting is a function swap:

```sql
alter table public.mission_actions
  drop constraint if exists mission_actions_follow_up_requires_blocked;

drop function if exists public.transition_mission_action(uuid, text, bigint, timestamptz, boolean);
```

then re-apply the W8 definition of `transition_mission_action(uuid, text, bigint)`
from `20260924200000_w8_lifecycle_integrity_provenance.sql` and re-grant it to
`authenticated`. Stored `follow_up_at` values survive the rollback and simply
stop being written.

## Interface changes

* The status control now offers only transitions the database will accept, and
  shows a closing note instead of a control once an action is Complete or
  Cancelled. Previously every action offered all five states, so most choices
  were guaranteed to be rejected.
* Selecting "Waiting" reveals an optional date field, pre-filled from the stored
  value so it survives reload.
* Moving an action out of Waiting warns that the follow-up will be removed
  before the change is saved.
* The action list shows the date in human terms ("in 4 days", "yesterday") and
  flags an overdue follow-up.
* An overdue follow-up becomes the mission's next step, ahead of other waiting
  work.

## Verification

`npm ci` clean · `npm test` 59/59 · `npm run typecheck` clean · `npm run lint`
clean · `npm run build` clean.

`apps/web/test/follow-up-persistence.test.mjs` covers the eight required
scenarios. Because the RPC cannot be executed in this environment, the
end-to-end scenarios run against a model of the contract, and a second group of
tests parses the migration itself to bind the SQL to that same model — including
a test that extracts the transition table from the SQL and asserts the
client-side mirror matches it exactly, so the two cannot drift.

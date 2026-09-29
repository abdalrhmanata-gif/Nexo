# ZAVQERA W18.1–W18.6 — Follow-up persistence

Baseline: `c605088`. Branch: `zavqera/alternative-web-deployment`.
Applied migration: `supabase/migrations/20260929182538_w18_action_follow_up_persistence.sql`.

## What the inspection found

W17 deferred this item on the assumption that a schema change would be needed. Inspecting the schema showed that it is not:

* `mission_actions.follow_up_at timestamptz null` already exists (W4).
* `mission_actions_follow_up_at_idx`, a partial index on non-null values, already exists (W4).
* `revoke update on table public.mission_actions from authenticated` (W7) means the RPC is already the **only** write path.

So the column was never the gap. The gap was that `transition_mission_action(uuid, text, bigint)` had no parameter able to carry a date, so nothing could ever write to the column.

## The change

The authoritative RPC is replaced by a superset of itself:

```
transition_mission_action(
  p_action_id uuid,
  p_to_status text,
  p_expected_version bigint,
  p_follow_up_at timestamptz default null,
  p_set_follow_up boolean default false
)
```

It is replaced rather than overloaded because two functions differing only by defaulted trailing parameters would make the existing three-argument call ambiguous. Both new parameters have defaults, so the pre-W18 call site remains valid.

`p_set_follow_up` distinguishes “leave unchanged” from “explicitly clear”.

## Database semantics

* Follow-up exists only while the action is `BLOCKED` (Waiting).
* Leaving `BLOCKED` clears the date and records the old/new values in `mission_events`.
* Staying `BLOCKED` preserves the date unless it is explicitly changed or cleared.
* Follow-up dates more than one day in the past or more than ten years ahead are rejected.
* `BLOCKED → RUNNING` is now legal so Waiting is not a dead end.

## Security preserved

Authentication is required; ownership is derived from `auth.uid()`; the action row is locked with `FOR UPDATE`; optimistic version fencing remains; the RPC remains `SECURITY DEFINER` with pinned `search_path`; `anon` execution is revoked and `authenticated` execution is granted.

## Current environment state

The migration is now **applied to ZAVQERA Development**.

Verified directly after application:

* `transition_mission_action(uuid,text,bigint,timestamptz,boolean)` exists.
* The five-argument function is executable by `authenticated`.
* The five-argument function is not executable by `anon`.
* `mission_actions_follow_up_requires_blocked` exists.
* The constraint is `NOT VALID`, so existing rows were not scanned or rewritten during application.
* No new unrelated Supabase security finding appeared; the existing five intentional SECURITY DEFINER warnings remain.

The Supabase migration registry records:

`20260929182538 / w18_action_follow_up_persistence`

The repository migration filename has been aligned to that exact applied version so future CLI migration history remains consistent.

## Verification

`npm ci` clean · `npm test` 59/59 · `npm run typecheck` clean · `npm run lint` clean · `npm run build` clean.

The remaining W18 validation is the live authenticated Waiting + follow-up lifecycle and the planned 5-user learning round.

Do not apply this migration to Supabase Main.
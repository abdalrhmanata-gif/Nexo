# ZAVQERA Mission Authority — Development Schema Reconciliation (2026-10-01)

Target: ZAVQERA Development mrwmmbytcymqgwvcoywd
Method: Read-only PostgreSQL catalog inspection; no rows were exported or changed.
Related issue: #25

## Result

The current Development schema supports mission ownership, versioned mission/action transitions, append-only mission history, verification and outcomes. It does not currently contain dedicated persisted authority, lease, approval, attempt, idempotency or budget state for a general external execution boundary.

### Confirmed existing columns

missions: id, workspace_id, owner_id, objective, status, created_at, updated_at, version.

mission_actions: id, mission_id, title, position, status, follow_up_at, created_at, updated_at, version.

History tables contain mission/owner references plus event, verification and outcome evidence.

### Confirmed existing constraints

The live catalog has primary/foreign keys and mission_actions_mission_position_key. No current unique constraint was found for an external execution idempotency key.

## Decision

Do not modify Development yet.

The Controlled Adapter persistence requirements cannot be implemented safely by silently reusing the existing mission/action/history tables. The required authority revision, lease fence, exact approval binding, attempt state, idempotency key and atomic budget reservation are not represented as dedicated persisted state today.

The next schema step, after executable test evidence, should be a narrowly scoped design for the minimum dedicated authority/attempt persistence and one atomic server-side authorization/dispatch transaction boundary. Existing mission/history tables should be referenced by foreign keys where appropriate rather than overloaded with unrelated mutable security state.

The design must preserve current append-only history semantics and the actual auth.users to private.handle_new_user_profile hook.

## Evidence gate still open

GitHub Actions is not exposing a workflow run for the new Web test workflow from this branch. The existing Flutter workflow has been extended to run the same Web controlled-adapter tests, but no run is yet visible. Therefore no CI PASS is claimed.

No migration, RPC, RLS, grant, deployment, billing or Supabase Main change was made by this step.

# ZAVQERA Mission Authority — Existing RPC Lock Review (2026-10-01)

Target: ZAVQERA Development mrwmmbytcymqgwvcoywd
Method: read-only PostgreSQL function-definition inspection.

## Verified strengths

- `transition_mission` locks the mission row with `FOR UPDATE`, verifies owner and expected version, validates transitions, and increments the version inside the same function transaction.
- `update_mission_details` locks the mission row with `FOR UPDATE` and enforces expected-version equality before update.
- `transition_mission_action` locks the action row with `FOR UPDATE OF a`, validates the owning mission, expected version and legal transition before update.
- `create_mission_verification` locks the mission row before creating verification.
- `commit_verified_mission_outcome` locks both the mission and exact verification row and checks for an existing outcome under the verification before insert.

These are useful concurrency patterns for mission CRUD and verification/outcome state.

## Authority gap that remains

None of these existing RPCs performs the complete external-execution JIT contract: authority revision/revocation, lease fence, exact approval binding, destination/audience binding, idempotency uniqueness, action/spend reservation, execution attempt state, or UNKNOWN reconciliation.

Therefore they should be reused where their existing responsibilities fit, but they should not be treated as the Mission Authority gateway.

## Next proof

The remaining required proof is a separate PostgreSQL concurrency test of the proposed execution-attempt/budget fence across independent sessions. The hosted Development project should remain unchanged while designing this test.

# ZAVQERA Follow-through API Contract v0.1

The API contract is intentionally provider-neutral.

## Commands

### createMission
Input:
- objective
- constraints
- requested authority
- success criteria

Output:
- mission
- proposed plan
- authority summary
- approval requirements

### approveMissionAuthority
Input:
- mission_id
- authority confirmation

Server must create/bind the authoritative delegation/approval state.

### pauseMission
Stops future autonomous work.

### resumeMission
Re-enters the mission execution loop only after current authorization is valid.

### getMission
Returns:
- objective
- status
- authority summary
- budget
- actions
- waiting state
- approvals
- evidence
- verification
- outcome

## External execution rule

Every side effect must cross the final ZAVQERA authorization boundary immediately
before execution and bind to the exact Action revision and input hash.

## Outcome rule

Provider success is not sufficient.

External action → Evidence → Verification → Outcome

UNKNOWN requires reconciliation and cannot be blindly retried.

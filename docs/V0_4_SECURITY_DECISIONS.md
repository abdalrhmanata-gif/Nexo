# NEXO v0.4 Security Decisions

## 1. Lease is not authority
The Execution Lease is a short-lived runtime envelope. It cannot create authority that the Delegation and Policy layers did not grant.

## 2. Final authorization is just-in-time
A previously approved plan is not sufficient by itself. Before external I/O, the server must reload authoritative Mission, Delegation, Policy, Action revision, Tool/Adapter state and Lease state, then make a fresh decision.

## 3. Replanning is bounded
An Agent may change strategy inside the approved envelope. A change to authority class, budget, expiry, success criteria, principal, provider scope, or other security-relevant constraint requires a new authorization revision.

## 4. Revocation wins
If the Lease or Delegation is revoked, expired, or suspended before the final gate, execution stops. A stale worker cannot cross the provider boundary.

## 5. Unknown is a quarantine state
After a provider call, timeout or transport failure cannot be interpreted as FAILED. NEXO records UNKNOWN and reconciles using the same idempotency identity before considering another attempt.

## 6. Ledger is not chain-of-thought
The Mission Ledger records control events, decisions, references and evidence identifiers. It must never become storage for hidden model reasoning or secrets.

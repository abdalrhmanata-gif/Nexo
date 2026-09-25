# ZAVQERA Mission Ledger Contract v0.1

The Mission Ledger is the durable chronological record of the mission's control-relevant lifecycle.

## Required properties
1. Append-oriented: history is never rewritten to hide an event.
2. Tenant-bound: every event belongs to exactly one mission/organization context.
3. Correlated: events carry mission/action/execution correlation in the production implementation.
4. Authority-aware: authority issuance, approval, lease, revocation and policy decisions are auditable.
5. Evidence-aware: evidence and verification events reference durable identifiers, not mutable narrative text.
6. Outcome-aware: an outcome is recorded only after the verification contract succeeds.
7. Model-independent: ledger meaning must not depend on GPT/Gemini/Claude/provider-specific state.

## Event sequence
IntentCreated → AuthorityRequested → AuthorityApproved → LeaseIssued → ActionAuthorized → ActionStarted → EvidenceRecorded → VerificationCompleted → OutcomeCommitted

Waiting, retries, revocations, failures and reconciliations are first-class events.

## Critical distinction
The ledger records what ZAVQERA knows and why it changed state. It is not a transcript of model thoughts and must not store secrets or hidden chain-of-thought.

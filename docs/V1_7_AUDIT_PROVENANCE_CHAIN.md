# NEXO v1.7 — Audit & Provenance Chain

## Purpose

NEXO must be able to reconstruct why a side effect happened, who/what authorized it,
which mission and action revision it belonged to, what evidence existed, and how the
system reached its outcome.

v1.7 introduces a deterministic append-only provenance model at the application
contract level.

## Chain

Each event contains:

Mission + Organization + Sequence + Actor + Payload Hash + Previous Event Hash
→ Event Hash

The previous event hash creates a tamper-evident chain.

## Security rules

1. Organization and mission binding are mandatory.
2. Sequence is monotonic.
3. Every event references the previous event hash.
4. Payloads are represented by hashes in the chain.
5. Correlation and causation identifiers preserve causal tracing.
6. Security-denied decisions are first-class audit events.
7. The chain never grants authority.
8. The chain never replaces authorization, verification, or the source-of-truth database.
9. A broken chain is a security/audit signal, not something to silently repair.
10. External outcome UNKNOWN remains UNKNOWN until reconciliation.

## Production direction

The application contract is intentionally storage-neutral. Production persistence must
use an append-only server-side ledger with database constraints/RLS and immutable
security-sensitive records. Cryptographic signatures, key rotation, anchoring and
external transparency proofs remain later hardening work.

## Why this matters

The NEXO trust story becomes:

Intent → Authority → Policy → JIT Decision → Execution → Evidence → Verification
→ Outcome → Provenance.

NEXO should be able to answer "why did this happen?" without trusting the agent's
own narrative.

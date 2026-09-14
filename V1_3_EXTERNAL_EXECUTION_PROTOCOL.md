# NEXO v1.3 — External Execution Protocol

## Purpose

v1.3 defines the contract that crosses the **Mission Kernel → Worker/Adapter** boundary.
It makes every external side effect traceable to the same mission, delegated authority,
action revision, execution lease, idempotency key, and input hash.

The protocol is provider-neutral. MCP, A2A, HTTP APIs, browser automation, SaaS APIs,
payment providers, or future execution systems can sit behind an adapter without owning
NEXO authority.

## Execution chain

`Mission Kernel → Invocation Envelope → Worker Identity → JIT Authorization → Adapter → External System → Receipt → Verification → Outcome`

The envelope is **not authority**. It is a compact, immutable description of already-approved execution intent.

## Non-negotiable bindings

1. `organization_id` and `mission_id` must remain bound.
2. `action_id + action_version + input_hash` form the action revision binding.
3. Authority Passport and Delegation are referenced explicitly.
4. Provider/model selection cannot create or expand authority.
5. An idempotency key is mandatory for side-effecting execution.
6. The input hash is mandatory and participates in the revision binding.
7. Envelope expiry is a safety fence, not a grant of permission.
8. A worker/adapter must still pass the server-side JIT authorization boundary.
9. The client must never be treated as the production authorization boundary.
10. An UNKNOWN external result is not an invitation to retry.

## Outcome semantics

- `NOT_SENT`: safe candidate for retry after authoritative checks.
- `ACCEPTED`: external system accepted the request; verification still required.
- `SUCCEEDED`: execution completed according to the external receipt; business outcome still requires verification.
- `FAILED`: execution failed; retry depends on idempotency and policy.
- `UNKNOWN`: external state cannot be established; reconciliation is mandatory before retry or commit.

## Why this matters

Without this boundary, an agent can produce an apparently valid tool call that loses its
connection to the original human intent while moving through workers, providers, retries,
and adapters. v1.3 keeps that chain explicit.

This is deliberately a protocol contract, not a production wire format or cryptographic
standard. Serialization, signatures, key management, replay protection, and transport
binding remain later hardening work.

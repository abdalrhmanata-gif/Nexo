# NEXO v0.8 — Provider-Agnostic Execution Gateway

## Purpose

NEXO must remain independent of any single model provider. GPT, Gemini, Claude, local models, and future agents are replaceable execution providers, not the authority layer.

## Control-plane rule

**NEXO owns authority. Providers execute bounded requests.**

A provider response can never:
- grant permission;
- change delegation;
- increase budget;
- alter mission success criteria;
- authorize another action;
- mark an external side effect VERIFIED or COMPLETED.

## Boundary

```text
Human Intent
   ↓
NEXO Mission + Delegation + Policy
   ↓
Authority Passport
   ↓
JIT Authorization
   ↓
Execution Gateway
   ├── OpenAI adapter
   ├── Google adapter
   ├── Anthropic adapter
   ├── Local / private adapter
   └── Future provider adapter
   ↓
Provider execution
   ↓
Raw provider result
   ↓
NEXO evidence / verification / outcome
```

## Provider independence

The same Mission, Delegation, Authority Passport, Action Revision and security constraints survive a provider change.

Provider selection may change because of:
- capability;
- cost;
- latency;
- availability;
- regional requirements;
- organizational policy;
- risk tier.

Changing provider does not create a new delegation.

## Freelancer independence

A freelancer should not have to rebuild their workflow around one AI vendor. NEXO is intended to make the user's mission portable across providers and over time.

The user owns the intent and delegation. NEXO owns the control plane. Providers compete on execution quality.

## Failure model

Provider unavailable → select only an approved alternative, if policy allows.

Provider output says "success" → NEXO treats it as untrusted data until verification.

Provider asks for more authority → deny; authority expansion requires a new NEXO delegation/revision.

Provider returns unknown external state → UNKNOWN + reconciliation; never blind retry.

## Production boundary

The current Flutter implementation is a contract/demo. Production adapters must run behind the server-side NEXO authorization boundary. Secrets, provider credentials and external side effects must never be trusted to the client.

## Strategic moat

NEXO should not win by having the best model. Models will change.

NEXO wins by owning the stable layer above them:

**Intent → Authority → Mission → Policy → Execution → Evidence → Verification → Outcome**

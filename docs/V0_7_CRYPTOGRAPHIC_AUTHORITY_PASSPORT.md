# NEXO v0.7 — Cryptographic Authority Passport

## Purpose
The Authority Passport is a portable, machine-verifiable envelope for authority that NEXO has already granted. It does not create, expand, or transfer authority.

## Canonical claim set
- schema_version
- passport_id
- organization_id
- principal_id
- mission_id
- delegation_id
- authority_revision
- agent_id (binding may be provider-specific; rebinding must not expand authority)
- allowed_actions / denied_actions
- max_actions / max_spend / currency
- issued_at / expires_at
- status

## Integrity and authenticity
The passport contains a canonical claims hash and a signature envelope:
- key_id
- signature_algorithm
- signature

v0.7 intentionally uses a development HMAC signer only to exercise the domain contract. It is NOT a production trust mechanism. Production cryptography must use a reviewed asymmetric profile and managed key lifecycle.

## Security invariants
1. Any claim mutation invalidates integrity verification.
2. Expired, inactive, wrong-key, wrong-algorithm, or invalid-signature passports fail closed.
3. Organization and Mission binding are mandatory at permission checks.
4. Denied actions override allowed actions.
5. A passport cannot expand Mission Contract, Delegation, Policy, budget, or success criteria.
6. Agent rebinding requires the same authority revision; a new authority scope requires a new delegation/revision.
7. Passport replay protection must be enforced by the receiving authority boundary using passport_id, authority_revision, audience, action revision, and freshness/nonce policy where required.
8. Revocation is authoritative outside the portable document; consumers must be able to consult current revocation state.

## Future cryptographic evaluation
Do not lock NEXO to JWT, JWS, COSE, W3C Verifiable Credentials, or another format yet. First freeze the claims, threat model, key lifecycle, replay model, audience binding, revocation model, and interoperability requirements. Then select the narrowest standards profile that satisfies them.

## Architecture
User Intent → Mission → Delegation → Authority Passport → Agent Binding → JIT Authorization → Adapter → External System → Evidence → Verification → Outcome.

## Explicit non-goals
- Passport is not a payment instrument.
- Passport is not an OAuth access token.
- Passport is not a model identity token.
- Passport is not a replacement for server-side authorization.
- Passport is not proof that an external action succeeded.

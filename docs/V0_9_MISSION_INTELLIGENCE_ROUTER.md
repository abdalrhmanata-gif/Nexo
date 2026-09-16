# NEXO v0.9 — Mission Intelligence Router

NEXO selects the best eligible AI provider/model for a mission while keeping authority independent from model selection.

## Separation
- Mission owns objective and success criteria.
- Delegation / Authority Passport owns bounded authority.
- Policy and JIT Authorization decide what may execute.
- Intelligence Router chooses which eligible intelligence provider/model is best for the bounded work.
- Execution Gateway adapts the provider.
- Evidence, verification, and outcome remain NEXO-controlled.

## Routing signals
Capability, estimated cost, latency, risk support, availability, and optional provider preference.

These are optimization/routing inputs, not authorization inputs.

## Invariants
1. Routing never grants authority.
2. Routing never changes delegation or budget.
3. Routing never changes success criteria.
4. Routing never bypasses JIT authorization.
5. Provider preference cannot override hard constraints.
6. No eligible provider means fail closed.
7. Provider output remains untrusted until NEXO verification.

## Independence
The same mission can move between GPT, Gemini, Claude, private/local models, or future providers without rebuilding the user's authority boundary.

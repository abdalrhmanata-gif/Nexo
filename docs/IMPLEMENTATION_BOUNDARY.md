# Implementation Boundary v0.1

## What we can safely build now

The product/UI/application layer can be developed without deploying the uncertain
historical database schema.

The repository boundary is deliberate:

Flutter → MissionRepository → backend/API → database

The UI must never receive service-role credentials and must never directly perform
security-sensitive writes.

## Security rule

Untrusted model/tool/provider/webhook data cannot mutate:

- delegation
- policy
- authority budget
- approval
- mission contract
- authorization
- execution security state

Agents may propose strategy. ZAVQERA decides authority.

## Database rule

Do not connect this scaffold to Supabase Main for writes until:

1. Candidate Core v0.2 is replayed on disposable PostgreSQL 17.
2. Canonical downstream chain passes.
3. pgTAP/static tests pass.
4. Preflight passes.
5. Concurrency/TOCTOU/provider ambiguity tests pass.

## Product stopping condition

Once the database foundation is proven, replace DemoMissionRepository with the
real Supabase-backed repository and implement the first end-to-end Follow-through
Mission.

The Mission remains the central user-facing object.

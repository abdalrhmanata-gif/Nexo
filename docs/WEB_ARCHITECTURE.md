# ZAVQERA Web Architecture

## Boundary

`apps/web` is an isolated Next.js App Router application. It is a presentation
surface only: route components render typed, local view-model data and do not
import Flutter code or domain services.

```text
Browser
  └── Next.js App Router
        ├── app/page.tsx                 landing
        ├── app/app/page.tsx             workspace
        ├── app/app/missions/new/page.tsx
        └── app/app/missions/[id]/page.tsx
              └── lib/mission-repository.ts (interface)
                    └── lib/local-mock-repository.ts (local adapter)
```

The intended production replacement is:

```text
Web UI -> MissionRepository -> authenticated API -> authorization/tenant
boundary -> data access layer -> PostgreSQL
```

The API and persistence contracts are documented in `WEB_API_CONTRACT.md`,
`BACKEND_ARCHITECTURE.md`, `AUTH_SESSION_MODEL.md`, and
`DATA_MODEL_CONTRACT.md`. They are design documents only; the current Web
application remains local/mock and unauthenticated.

The `components/` directory contains reusable visual primitives. Styling is
plain CSS to keep the first slice dependency-light and portable.

## Route contract

| Route | Responsibility |
| --- | --- |
| `/` | Product orientation and workspace entry |
| `/app` | Mission overview and activity scan |
| `/app/missions/new` | Non-persisting mission-intent form |
| `/app/missions/[id]` | Read-only mission summary for a known mock id |

Unknown detail ids use the same presentational shell and communicate that data
is unavailable; no server lookup or fallback execution is performed.

## Data and security boundary

`MissionRepository` is the UI's data boundary. The current
`localMockMissionRepository` adapter returns explicitly local fixtures, not a
cache or an authorization decision. There is no
auth, Supabase client, secret, backend route, server action, mutation, or
execution path in `apps/web`.

When a real integration is introduced, keep the browser responsible for
rendering and interaction only. Fetching, authorization, authority passports,
budgets, policy, execution, evidence, and verification belong behind a
server-controlled boundary and must continue to follow the existing Flutter
contracts.

## Rendering and accessibility

Pages are server-rendered by default. The only interactive behavior in this
slice is native browser navigation and form affordances. The layout uses
semantic landmarks and responsive CSS with a reduced-motion preference. No
client state is needed until a real data or interaction contract exists.

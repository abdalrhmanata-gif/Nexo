# ZAVQERA Web Technology Stack Decision

## Decision

Use **Next.js 14 App Router with TypeScript and React 18** for the first web
foundation.

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js 14 | Stable App Router, simple route composition, production build |
| Language | TypeScript | Typed route-facing view models and safer integration seam |
| UI | React 18 | Matches the selected Next.js baseline without extra runtime layers |
| Styling | Plain CSS | Minimal dependency surface and clear responsive control |
| Quality | ESLint, `tsc --noEmit`, Next build | Fast, practical checks for a UI-only slice |
| Package manager | npm | Uses the repository-local `apps/web/package-lock.json` |

## Alternatives considered

Flutter web would reuse the existing UI technology but would blur the requested
web application boundary and make the browser-first route contract less clear.
Vite would be a valid lightweight SPA choice, but Next's App Router provides a
useful server-rendered foundation without requiring a backend in this change.
Tailwind and component libraries are deferred to avoid locking visual or
dependency conventions before the product language is validated.

## Constraints

This decision does not authorize auth, Supabase, API calls, persistence, server
actions, execution, or changes to Flutter semantics. Dependency upgrades should
be deliberate and validated through the web checks plus the existing Flutter
verification boundary.

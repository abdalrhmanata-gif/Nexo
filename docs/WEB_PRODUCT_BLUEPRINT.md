# ZAVQERA Web Product Blueprint

## Purpose

The web foundation is a UI-only companion for the existing ZAVQERA mission-control
product. It makes the mission lifecycle legible to a human operator without
introducing a second runtime, authority model, or data store.

## Initial user journey

1. **Landing (`/`)** — understand the product promise and enter the workspace.
2. **Mission workspace (`/app`)** — scan a small set of missions, their status,
   risk posture, and recent activity.
3. **Create mission (`/app/missions/new`)** — shape intent, success criteria,
   constraints, and review mode in a calm, bounded form.
4. **Mission detail (`/app/missions/[id]`)** — inspect a mission's current
   state, authority boundary, checkpoints, and activity timeline.

The form and controls are intentionally presentational. They do not submit,
persist, authenticate, execute, authorize, or call an external service.

## Product principles

- **Human intent stays visible.** The UI should show what a mission is trying
  to accomplish before showing implementation detail.
- **Boundaries are first-class.** Budget, risk, approval, and verification
  states should be obvious and never implied by model output.
- **Fail closed in presentation.** Unknown or waiting states are displayed as
  unresolved; the web layer must not turn them into success.
- **Progressive disclosure.** Summary cards support scanning; detail pages
  expose the evidence needed for a deliberate decision.
- **Accessible by default.** Semantic landmarks, keyboard focus, readable
  contrast, responsive layout, and reduced-motion support are baseline quality.

## Out of scope for this foundation

Authentication, Supabase or API clients, server actions, workers, adapters,
execution, approval side effects, notifications, analytics, billing, and
production persistence are deliberately excluded. The existing Flutter domain,
security semantics, and historical NEXO provenance remain authoritative and
unchanged.

## Next product increments

The next layer may replace the mock view-model with a typed read API, then add
authentication and server-side authorization at the integration boundary. Each
increment should preserve the route contract and keep execution outside the
browser.

# ZAVQERA Backend Architecture Boundary

## Purpose

This document defines the smallest server-side boundary required to replace
the Web MVP's local adapter. It is a design contract only. No backend,
database, Supabase connection, migration, credential, or production
authentication is implemented in this phase.

```text
Browser
  -> authenticated server/API boundary
  -> authorization and tenant boundary
  -> data access layer
  -> PostgreSQL
```

The browser renders server-provided data and submits user intent. It is never
authoritative for identity, ownership, state transitions, authority, budgets,
verification, or outcomes. The server verifies the session on every protected
request and enforces the user's ownership and workspace/tenant boundary before
reading or changing data.

## Boundaries

- **Authenticated server/API boundary:** validates the session and normalizes
  requests and errors.
- **Authorization/tenant boundary:** resolves the authenticated user and
  workspace membership, then checks mission ownership or an explicitly
  authorized future collaboration relationship.
- **Data access layer:** performs parameterized reads and writes against the
  database; it does not trust browser-supplied ownership or state.
- **PostgreSQL:** persists data and enforces integrity. Row-level security
  (RLS) is defense-in-depth and is part of the production backend plan.

Service-role credentials, if ever required for narrowly scoped server
operations, remain server-only and never reach browser bundles or responses.

## Supabase preparation

Supabase may eventually provide managed Auth, PostgreSQL, and RLS. The
application should access it through the authenticated server/data-access
boundary rather than connecting the browser directly to privileged resources.
This phase intentionally creates no Supabase project configuration, tables,
migrations, policies, keys, or client integration.

## Initial persistence scope

The first backend slice only needs to support a user's owned Missions and
their action/progress history:

- Mission identity, objective, owner, workspace/tenant, state, and timestamps.
- Ordered Actions belonging to a Mission.
- Follow-up information associated with the Mission or Action.
- Verification and outcome metadata recorded after execution or user input.
- Append-only activity/history records for user-visible changes.

Authorization data (user, account/workspace membership, and session
association) is described separately in `AUTH_SESSION_MODEL.md`. Execution,
provider, authority, and security-contract internals remain governed by the
existing Core contracts and are not duplicated here.

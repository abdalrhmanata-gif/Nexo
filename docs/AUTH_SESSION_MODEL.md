# ZAVQERA Auth and Session Model

This is the intended contract for a future authenticated Web backend. It does
not add authentication or session handling to the current application.

## Identity

- **User:** the human identity established by the authentication provider.
  User identity is resolved server-side from a verified session, never from a
  request body or browser-only value.
- **Session:** a short-lived authenticated context issued by the auth system.
  Protected API requests must present a valid session; expired, malformed, or
  revoked sessions fail closed.
- **Account/workspace:** the ownership and tenancy boundary in which Missions
  live. A user may belong to one or more accounts in a future collaboration
  model, but membership and role are server-verified.

The initial Web MVP needs only the authenticated user, their active account,
and owned Missions. Invitations, roles, and collaboration are intentionally
outside this phase.

## Request rules

1. The server verifies the session before loading protected data.
2. The server derives `userId` and `accountId` from verified identity and
   membership, not from client-controlled ownership fields.
3. Every Mission read or mutation is scoped to that account and authorized
   owner.
4. Missing resources are returned without leaking whether an inaccessible
   identifier exists.
5. Service credentials remain server-only.

## Future Supabase mapping

Supabase Auth may issue and refresh sessions, PostgreSQL may store account and
Mission data, and RLS may enforce account scoping as defense-in-depth. The
server remains the application authorization boundary, and RLS must not be
treated as a substitute for explicit authorization checks.

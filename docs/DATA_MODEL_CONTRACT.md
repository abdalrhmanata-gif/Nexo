# ZAVQERA Data Model Contract

This contract describes only the records required for the first authenticated
Web slice. It is not a migration or a finalized PostgreSQL schema.

## Ownership

Every persisted Mission belongs to an account/workspace and has an owner user.
All child records are reached through their Mission and inherit the same
tenant boundary. The server derives ownership and tenant identifiers from the
verified session and membership.

## Mission

A Mission contains:

- stable identifier
- objective/intent text
- current state
- owner and account/workspace references
- progress derived from its ordered Actions
- optional follow-up date and status
- verification/outcome metadata when applicable
- created and updated timestamps

## Action

An Action belongs to one Mission and contains an explicit order, user-defined
description, completion/progress state, and optional follow-up information.
The server validates Mission ownership before reading or changing an Action.

## Verification and outcome

Verification and outcome metadata records what was checked, the resulting
status, relevant evidence references or notes, and its relationship to the
Mission/Action revision. Unverified claims must not be represented as verified
success. The existing Core security and execution contracts remain the source
of truth for execution semantics.

## Activity/history

Activity records are append-only, Mission-scoped entries describing meaningful
state, Action, follow-up, verification, or outcome changes. They support the
user-facing history view; they are not an authorization ledger and must not be
used as a substitute for server-side checks.

No provider, payment, notification, collaboration, or speculative analytics
records are required for this initial contract.

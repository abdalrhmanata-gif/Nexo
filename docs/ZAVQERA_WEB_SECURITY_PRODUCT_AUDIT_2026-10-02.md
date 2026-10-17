# ZAVQERA Web Product and Security Audit — 2026-10-02

Scope: source review of the current PR branch, public guidance from OWASP, Next.js, and Supabase. This is not a penetration test and does not replace live browser testing.

## Implemented during this review

- Password reset uses `NEXT_PUBLIC_SITE_URL` when configured, instead of always using the browser's current origin.
- PKCE and token-hash auth callbacks now prefer the configured public site origin, reducing the risk of a forwarded/Host header selecting the post-authentication destination.
- Mission deletion now checks that a row was actually removed and reports failure for stale IDs or zero-row/RLS-filtered deletes.
- Regression tests cover configured callback origin selection and deletion confirmation.

## Findings and next work

### P1 — Mission creation is not atomic
`createMission` inserts the mission first, then inserts its actions. If action insertion fails, it attempts a compensating mission delete; provenance/audit foreign keys can prevent that cleanup. Result: an incomplete mission may remain and the form can fail without a clear recovery path.
Recommended resolution: design and test a transaction-backed database operation using the project's verified migration/authority contracts before implementation. Do not invent or apply a new RPC directly to hosted projects during this review.

### P1 — Password reset must be verified end-to-end on the deployed preview
Code now selects the configured public URL, but source review cannot prove the actual email template, current Netlify deploy, Supabase redirect allow-list, and PKCE exchange all work together. Test request → newest email → callback → reset form → password update → sign-in. Never reuse a previously clicked reset link.

### P1 — W21 authenticated browser E2E remains open
The isolated, disposable local Supabase browser E2E and cleanup proof have not yet been recorded as PASS. Keep production release blocked until this gate is completed.

### P1 — Mission Authority enforcement evidence remains incomplete
Existing unit/isolated concurrency evidence is not proof of all production server/database authorization, TOCTOU, ownership, and lifecycle enforcement. Finish the remaining documented verification before public release.

### P2 — Account protection
- Confirm Supabase email confirmation is enabled for new accounts unless product requirements explicitly justify otherwise.
- Configure appropriate Auth rate limits and SMTP delivery/DMARC for the real sender domain before public launch.
- Keep generic reset responses to avoid account enumeration; rate-limit reset attempts and monitor abuse.
- Leaked-password protection remains unavailable on the current Supabase plan per the dashboard warning; evaluate the plan upgrade before public launch, without enabling paid billing without approval.
- Add MFA or step-up authentication before any future high-impact account or authority-changing features.

### P2 — Mission lifecycle and user experience
- Mission deletion intentionally may be rejected when historical provenance must be retained; explain this as an archive/close workflow in the UI rather than encouraging repeated delete attempts.
- Add integration tests for create mission + first actions, action insert failure, stale-version edits, cross-user reads/writes/deletes, and concurrent action ordering.
- Creation currently seeds actions from success criteria when the user leaves “First steps” blank. Verify that this behavior is intentional; criteria and actions represent different concepts and should not be silently conflated long-term.
- Add accessible loading/error states for server-action failures, especially mission creation; avoid unhandled generic 500 pages.

### P2 — AI and API controls
- AI endpoints require authentication, cap input/output, use server-only provider credentials, and keep suggestions draft-only.
- Live provider test remains blocked until a non-production `OPENAI_API_KEY` is configured.
- Before launch, test quota races, reservation cleanup, provider timeouts, and that a failed provider call does not consume quota.
- Add explicit rate limiting for password reset and AI endpoints; monthly quota alone is not an abuse-rate limiter.

### Visual design
Current palette (navy, teal, neutral background, restrained orange for waiting/danger) is coherent and focus indicators/reduced-motion styles exist. No broad color redesign is justified by this code review. Before launch, check text/button contrast and mobile layout with an accessibility audit rather than changing colors speculatively.

## Release gate
Do not merge this PR to `main` or deploy production until CI is green on the final head, reset flow is verified live on preview, W21 is PASS, and Mission Authority enforcement evidence is complete.

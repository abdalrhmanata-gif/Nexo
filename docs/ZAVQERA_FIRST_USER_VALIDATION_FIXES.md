# ZAVQERA — First real-user validation: defect fixes and baseline

## Validated baseline

| Item | Value |
| --- | --- |
| Branch | `zavqera/alternative-web-deployment` |
| Commit | `e402bb1fbd7c833358c54b836ccfc457af8708c2` |
| Netlify site | `unique-kringle-3ce321` |
| Netlify deploy | `6abbf43bf8297c00072a8748` |
| Public URL | https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app |
| Supabase project | ZAVQERA Development (`mrwmmbytcymqgwvcoywd`) |

`main` remains at `89ff12f23fba21eee11aad593275ec23477ec6ec`. PRs #12, #19, #20 and #21 remain open and unmerged. No migration or Supabase Main change was made.

## Defect 1 — email confirmation never completed the auth flow

**Root cause.** The web app authenticates through `@supabase/ssr`, which signs up over the
PKCE flow. A PKCE confirmation link resolves through the Supabase `/auth/v1/verify`
endpoint and then redirects back to the application carrying a single-use `code` that must
be exchanged for a session. The application had no token-exchange endpoint: `apps/web/app/auth/`
contained only `sign-in` and `sign-up`. The code was never exchanged, so no session cookie was
ever written and confirmation could not complete.

A second defect was found during live verification on Netlify. Netlify serves a branch deploy
behind a proxy, so `request.url` inside a Route Handler carries the deploy *permalink* host
rather than the host the browser is on. Redirecting through it would have sent the user to a
different origin immediately after the exchange, discarding the session cookie just written.

**Fix.**

- `apps/web/app/auth/callback/route.ts` — exchanges the PKCE `code` for a cookie-backed session.
- `apps/web/app/auth/confirm/route.ts` — `verifyOtp` exchange for `{{ .TokenHash }}`-style templates.
- `apps/web/components/auth-form.tsx` — sign-up now sends `emailRedirectTo` pointing at the
  deployed origin's callback, and the sign-in page renders an actionable message when a link fails.
- `apps/web/middleware.ts` — signed-in users are no longer bounced away from the confirmation
  endpoints before the exchange can run.
- `apps/web/lib/auth/redirect.mjs` — rejects non-relative redirect targets so a crafted
  confirmation link cannot become an open redirect, and resolves the redirect origin from the
  forwarded-host headers.

## Defect 2 — a created Mission could not be reopened or removed with confidence

**Root cause.** The mission detail route and the delete endpoint both already existed and were
correctly authorized, so this was a discoverability and confidence defect rather than a data one.
The only route into a mission was the card title rendered as ordinary body text, and deletion was
gated by a bare `window.confirm`. The `button-danger` class used by the delete button had no CSS
rule at all, so the destructive action rendered identically to a normal button.

**Fix.**

- `apps/web/components/mission-card.tsx` — explicit `Open mission` affordance on every card.
- `apps/web/components/delete-mission-form.tsx` — two-step in-page confirmation with an explicit
  cancel and a plain statement that deletion is permanent.
- `apps/web/app/globals.css` — danger-zone and destructive-button styling.

Deletion continues to run through the authorized server repository, scoped by owned workspace.
No RLS policy, authentication path, or authoritative mutation boundary was changed.

## Verification performed

Local: `npm ci`, `npm test` (19/19), `npm run typecheck`, `npm run lint`, `npm run build` — all pass.
Regression tests for both defects live in `apps/web/test/auth-and-mission-lifecycle.test.mjs`.

Live, against the deploy above:

| Route | Result |
| --- | --- |
| `/`, `/auth/sign-in`, `/auth/sign-up` | 200 |
| `/app`, `/app/missions/new` | 307 → `/auth/sign-in?next=…` |
| `/api/status` | 200, Supabase Development configuration active |
| `/auth/callback` (no code) | 307 → `/auth/sign-in?error=missing-code`, on the branch host |
| `/auth/confirm` (no token) | 307 → `/auth/sign-in?error=missing-token`, on the branch host |
| `/auth/callback?code=…` (invalid) | 307 → `/auth/sign-in?error=confirmation-link` |
| `/app` body | no mock fallback content |

## Remaining owner actions before the validation gate can close

1. In ZAVQERA **Development** → Authentication → URL Configuration, add the branch deploy to the
   redirect allowlist:
   `https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app/**`
   Without this, Supabase rejects the `emailRedirectTo` value and falls back to the Site URL, and
   the confirmation link will not return to this deployment.
2. Complete the real-user pass: sign up with a fresh address, open the emailed link, and walk the
   mission lifecycle (create, reopen, actions, Waiting plus follow-up date, verification, outcome,
   delete, and a cross-user access attempt).

Stage 2 should begin only from the commit recorded above, after step 2 passes.

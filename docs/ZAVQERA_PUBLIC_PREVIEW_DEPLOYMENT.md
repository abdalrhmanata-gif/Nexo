# ZAVQERA — Public Preview Deployment (First-User Validation)

Goal: a real, publicly reachable preview URL for the ZAVQERA Web MVP (`apps/web`) so first-user
validation can be run with real testers.

This document records the verified deployment path, the repository-side configuration, and the one
remaining manual dashboard step. It intentionally contains **no** secrets, tokens, or credentials.

## 1. Current verified state

The Vercel project `nexo` (owner scope `abdalrhmanata-1982`) is already connected to this
repository through the Vercel GitHub integration. This was confirmed via the GitHub Deployments
API, not assumed:

| Environment | Git ref | Deployment state |
| --- | --- | --- |
| Preview | `bb095b7` (`zavqera/integrate-origin-main-clean`) | `success` |
| Production | `fcac980` (`main`) | `success` |

So the build pipeline itself is healthy. **Builds are not the problem.**

### Monorepo root directory is already correct

The repository root is a Flutter project and contains no `package.json`. A Vercel build would fail
immediately if the project's **Root Directory** were the repository root. Because builds succeed,
the Vercel project's Root Directory is already set to `apps/web`. No repository change can set or
override Root Directory — it is a project-level dashboard setting only.

## 2. The actual blocker: Deployment Protection

Every deployment URL belonging to the project returns `HTTP 302` to `vercel.com/sso-api`, which
redirects anonymous visitors to `vercel.com/login`:

```
https://nexo-17ege1eom-abdalrhmanata-1982.vercel.app                       -> 302 vercel.com/sso-api
https://nexo-git-main-abdalrhmanata-1982.vercel.app                        -> 302 vercel.com/sso-api
https://nexo-git-zavqera-integrate-origin-main-clean-abdalrhmanata-1982... -> 302 vercel.com/sso-api
```

This is **Vercel Deployment Protection ("Vercel Authentication")**. It gates the deployment behind
Vercel account login, so external first-user testers cannot reach it.

This is an account/team authorization setting. It **cannot** be disabled from repository
configuration, from `vercel.json`, or from a GitHub Actions workflow. No repository-side change can
fix it.

The `302` proves the domain exists and is protected — not that it is missing. A non-existent Vercel
domain returns `404`. Control test:

| Domain | Result | Meaning |
| --- | --- | --- |
| `nexo-git-zavqera-integrate-origin-main-clean-abdalrhmanata-1982.vercel.app` | `302` | exists, protected |
| `nexo-git-this-branch-does-not-exist-xyz-abdalrhmanata-1982.vercel.app` | `404` | does not exist |

### Do not disable protection globally

Setting **Vercel Authentication** to *Disabled* would expose **production and every preview**. That
is broader than needed. Vercel supports a Preview-scoped exception that is the correct fix — see
section 5.

> Note: `https://nexo.vercel.app` responds `200` but serves an unrelated third-party project
> ("Plataforma para el ecosistema musical"). It is **not** this project and must not be used or
> referenced as the ZAVQERA preview URL.

## 3. Repository-side change included here

A single file, `apps/web/vercel.json`, pins the monorepo build so it stays deterministic and
matches `.github/workflows/web.yml`:

```json
{
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run build"
}
```

Because the project's Root Directory is `apps/web`, Vercel reads this file. It changes no product
behavior, adds no environment variables, and adds no secrets.

## 4. Environment variables

`apps/web/lib/supabase/config.ts` reads only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Both are **public, non-secret** client configuration. `isSupabaseConfigured()` makes the app
degrade gracefully when they are absent, so `npm run build` succeeds with no environment
configured at all — which is why the Vercel builds already pass.

For a functional signed-in tester flow these two public values must be set in the Vercel dashboard.
See section 6 — without them the preview silently serves mock data.

## 5. Remaining manual step: add a Deployment Protection Exception

This is the only outstanding work. It is an authorization-gated dashboard action, not a code
change, and it must be performed by someone with access to the Vercel project.

**Use a Deployment Protection Exception, not a global disable.** An Exception unprotects exactly one
preview domain and leaves production and every other preview fully protected.

Per Vercel's plan matrix, **Deployment Protection Exceptions are "Included" on Hobby, Pro, and
Enterprise** — no upgrade, no add-on, and no additional cost is required.

### Exact steps

1. Vercel [dashboard](https://vercel.com/dashboard) → select project **`nexo`** (scope
   `abdalrhmanata-1982`)
2. Sidebar → **Settings** → **Deployment Protection**
3. Scroll to the **Deployment Protection Exceptions** section → select **Add Domain**
4. In the **Unprotect Domain** modal, enter exactly:

   ```
   nexo-git-zavqera-integrate-origin-main-clean-abdalrhmanata-1982.vercel.app
   ```

5. Select **Continue**
6. In the confirmation modal:
   - re-enter the same domain in the first input
   - type `unprotect my domain` in the second input
   - select **Confirm**

Leave **Vercel Authentication** itself **enabled**. Do not change the protection scope.

All existing **and future** deployments for that domain become public, so the URL stays valid across
subsequent pushes to `zavqera/integrate-origin-main-clean`. To reverse it later, remove the domain
from the same section (confirmation phrase `reprotect my domain`).

### Tester URL

```
https://nexo-git-zavqera-integrate-origin-main-clean-abdalrhmanata-1982.vercel.app
```

This is the **stable branch alias** — it always points at the latest deployment of
`zavqera/integrate-origin-main-clean`. Do **not** hand testers a per-deployment URL such as
`nexo-ddnf84kun-…`; those change on every push.

### Considered and rejected: Shareable Links

Vercel Shareable Links also bypass protection, but they are rejected here:

- on Hobby they are **limited to one link per account**
- they are **per-deployment**, so every new push would need a new link re-sent to every tester

A Deployment Protection Exception is domain-scoped and survives redeploys, so it is the correct
mechanism for an ongoing validation round.

## 6. Environment variables are required for valid evidence

Making the URL public is necessary but **not sufficient**. Verified in code:

- `apps/web/middleware.ts` short-circuits with `NextResponse.next()` when the Supabase variables are
  absent, so the authenticated route boundary does not engage
- `app/app/page.tsx` and `app/app/missions/[id]/page.tsx` fall back to `localMockMissionRepository`
  when `isSupabaseConfigured()` is false

So an unconfigured preview would serve **mock data with no sign-in and no persistence**. Testers
would appear to complete the loop while nothing was saved, producing **misleading first-user
evidence**.

Before running validation, set both values for the **Preview** environment
(**Settings → Environment Variables**), pointed at the **Development** Supabase project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Both are public, non-secret client configuration and are already documented in
`apps/web/.env.example`. They are deliberately not committed. No service-role key, database
password, or other secret is required by the web app, and none may ever be added. Supabase **Main**
must remain untouched; use **Development** only.

Redeploy after setting them so the build picks up the values.

## 7. Why no GitHub-native fallback was implemented

`apps/web` is a server-rendered Next.js application. It ships:

- Route Handlers under `apps/web/app/api/**` (mission, action, verification, outcome mutations)
- `apps/web/middleware.ts` enforcing the authenticated route boundary
- dynamic, per-request server rendering for `/app/**`

GitHub Pages serves static files only. Publishing through GitHub Pages would require
`output: "export"`, which would delete the API routes and middleware and break the authorization
boundary that W13/W14 verify. That is an architectural compromise and is explicitly out of scope.

Every other repository-connected host capable of running this app (Netlify, Render, Railway,
Cloudflare) would require creating a **new** project plus adding **new** deployment credentials to
this repository. Both are disallowed by the issue constraints, and neither is a smaller change than
flipping one existing Vercel setting.

Conclusion: the existing Vercel project is already the correct and smallest path. The remaining gap
is one authorization-gated dashboard toggle, documented above.
